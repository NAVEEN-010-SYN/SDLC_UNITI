import { BotReply, Conversation, IntentPrediction, Principal } from '../domain/types';
import { PlatformClients } from '../clients/platformClients';
import { RequestContext } from '../clients/httpClient';
import { Logger } from '../logger';
import { quickReplyPayload } from '../nlu/intentClassifier';
import { FlowRegistry } from './flows';
import { FlowContext, FlowDefinition, prefillFromEntities, startFlow, StepOutcome, stepFlow } from './stateMachine';

/**
 * Dialog manager: decides, for one user turn, whether to continue the active
 * flow, interrupt it with a new intent (suspending it for later), cancel it,
 * start a new flow, or answer conversationally. Mutates the conversation
 * object passed in; persistence is the caller's responsibility.
 */

export interface TurnEvent {
  type: 'flow_started' | 'flow_completed' | 'flow_abandoned' | 'flow_suspended' | 'fallback' | 'handoff_requested' | 'conversation_ended';
  flowId?: string;
  outcome?: string;
}

export interface TurnResult {
  replies: BotReply[];
  events: TurnEvent[];
}

export interface DialogEngineDeps {
  flows: FlowRegistry;
  clients: PlatformClients;
  logger: Logger;
  clock?: () => Date;
}

/** An intent this confident may interrupt a flow that is waiting for a slot value. */
export const INTERRUPT_CONFIDENCE = 0.85;
/** After this many consecutive fallbacks we proactively offer a human. */
export const MAX_FALLBACKS_BEFORE_AGENT = 2;
const MAX_SUSPENDED = 3;

const CONVERSATIONAL = new Set(['GREETING', 'GOODBYE', 'AFFIRM', 'DENY', 'CANCEL', 'FALLBACK']);

export function mainMenu(): BotReply['quickReplies'] {
  return [
    { label: 'Check for outages', payload: quickReplyPayload('CHECK_OUTAGE') },
    { label: 'My bill', payload: quickReplyPayload('BILL_ENQUIRY') },
    { label: 'Reset my router', payload: quickReplyPayload('RESET_ROUTER') },
    { label: 'Upgrade my plan', payload: quickReplyPayload('PLAN_UPGRADE') },
    { label: 'Raise a ticket', payload: quickReplyPayload('RAISE_TICKET') },
    { label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') },
  ];
}

export function greeting(principal: Principal): BotReply {
  const name = principal.displayName ? `, ${principal.displayName.split(' ')[0]}` : '';
  return { text: `Hi${name}! I'm the Uniti assistant. What can I help you with today?`, quickReplies: mainMenu() };
}

export class DialogEngine {
  private readonly clock: () => Date;

  constructor(private readonly deps: DialogEngineDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async handleTurn(conversation: Conversation, text: string, prediction: IntentPrediction, request: RequestContext): Promise<TurnResult> {
    try {
      return await this.route(conversation, text, prediction, request);
    } finally {
      // Updated after routing so flows (e.g. handoff) can see what the customer was doing before.
      if (prediction.intent !== 'FALLBACK') conversation.lastIntent = prediction.intent;
    }
  }

  private async route(conversation: Conversation, text: string, prediction: IntentPrediction, request: RequestContext): Promise<TurnResult> {
    const replies: BotReply[] = [];
    const events: TurnEvent[] = [];
    const active = conversation.activeFlow ? this.deps.flows.get(conversation.activeFlow.flowId) : undefined;
    const targetFlow = this.deps.flows.forIntent(prediction.intent);

    // 1. Explicit cancel always wins.
    if (prediction.intent === 'CANCEL' && conversation.activeFlow) {
      events.push({ type: 'flow_abandoned', flowId: conversation.activeFlow.flowId, outcome: 'cancelled' });
      conversation.activeFlow = undefined;
      conversation.suspendedFlows = [];
      replies.push({ text: "OK, I've stopped that. What else can I help with?", quickReplies: mainMenu() });
      return { replies, events };
    }

    // 2. Continue the active flow unless a different, confident flow intent interrupts it.
    if (active && conversation.activeFlow) {
      const waiting = active.states[conversation.activeFlow.state];
      const capturesFreeText = waiting?.kind === 'slot' && waiting.captureFreeText === true;
      // Quick-reply payloads (source "context") are explicit choices and may always interrupt;
      // typed text cannot interrupt a free-text slot such as a fault description.
      const interrupts =
        targetFlow !== undefined &&
        targetFlow.id !== active.id &&
        prediction.confidence >= INTERRUPT_CONFIDENCE &&
        (prediction.source === 'context' || !capturesFreeText);
      if (!interrupts || !this.isAllowed(targetFlow!, conversation.principal)) {
        const outcome = await stepFlow(active, conversation.activeFlow, this.context(conversation, request), {
          text,
          entities: prediction.entities,
        });
        this.applyOutcome(conversation, active, outcome, replies, events);
        await this.resumeIfIdle(conversation, request, replies, events);
        return { replies, events };
      }
      this.suspend(conversation, events);
    }

    // 3. Start a new flow for a routable intent.
    if (targetFlow) {
      if (!this.isAllowed(targetFlow, conversation.principal)) {
        replies.push({
          text: `Sorry, your account role can't do that here. Please ask your account administrator, or I can connect you to our team.`,
          quickReplies: [{ label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') }],
        });
        return { replies, events };
      }
      conversation.fallbackCount = 0;
      await this.start(conversation, targetFlow, prediction, request, replies, events);
      await this.resumeIfIdle(conversation, request, replies, events);
      return { replies, events };
    }

    // 4. Conversational intents with no flow attached.
    if (CONVERSATIONAL.has(prediction.intent)) {
      this.conversational(conversation, prediction, replies, events);
    }
    return { replies, events };
  }

  private conversational(conversation: Conversation, prediction: IntentPrediction, replies: BotReply[], events: TurnEvent[]): void {
    switch (prediction.intent) {
      case 'GREETING':
        conversation.fallbackCount = 0;
        replies.push(greeting(conversation.principal));
        return;
      case 'GOODBYE':
        conversation.status = 'ENDED';
        events.push({ type: 'conversation_ended', outcome: 'user_goodbye' });
        replies.push({ text: 'Thanks for chatting with Uniti. Have a great day!' });
        return;
      case 'AFFIRM':
      case 'DENY':
      case 'CANCEL':
        replies.push({ text: 'Is there anything else I can help you with?', quickReplies: mainMenu() });
        return;
      default: {
        conversation.fallbackCount += 1;
        events.push({ type: 'fallback', outcome: String(conversation.fallbackCount) });
        if (conversation.fallbackCount > MAX_FALLBACKS_BEFORE_AGENT) {
          replies.push({
            text: "I'm sorry, I'm still not following. Would you like to speak to someone from our team?",
            quickReplies: [{ label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') }, ...(mainMenu() ?? []).slice(0, 3)],
          });
        } else {
          replies.push({ text: "Sorry, I didn't quite get that. Here are some things I can help with:", quickReplies: mainMenu() });
        }
      }
    }
  }

  private async start(
    conversation: Conversation,
    flow: FlowDefinition,
    prediction: IntentPrediction,
    request: RequestContext,
    replies: BotReply[],
    events: TurnEvent[],
  ): Promise<void> {
    const state = startFlow(flow, prefillFromEntities(flow, prediction.entities), this.clock());
    conversation.activeFlow = state;
    events.push({ type: 'flow_started', flowId: flow.id });
    const outcome = await stepFlow(flow, state, this.context(conversation, request));
    this.applyOutcome(conversation, flow, outcome, replies, events);
  }

  private applyOutcome(conversation: Conversation, flow: FlowDefinition, outcome: StepOutcome, replies: BotReply[], events: TurnEvent[]): void {
    replies.push(...outcome.replies);
    conversation.activeFlow = outcome.flow;
    if (outcome.flow) return;

    if (outcome.abandoned) {
      events.push({ type: 'flow_abandoned', flowId: flow.id, outcome: outcome.outcome });
      conversation.fallbackCount += 1;
    } else {
      events.push({ type: 'flow_completed', flowId: flow.id, outcome: outcome.outcome });
    }
    if (outcome.handoff) {
      conversation.status = 'HANDED_OFF';
      conversation.suspendedFlows = [];
      conversation.handoff = { ...outcome.handoff, requestedAt: this.clock().toISOString() };
      events.push({ type: 'handoff_requested', flowId: flow.id, outcome: outcome.handoff.queue });
    }
  }

  private suspend(conversation: Conversation, events: TurnEvent[]): void {
    if (!conversation.activeFlow) return;
    events.push({ type: 'flow_suspended', flowId: conversation.activeFlow.flowId });
    conversation.suspendedFlows = [conversation.activeFlow, ...conversation.suspendedFlows].slice(0, MAX_SUSPENDED);
    conversation.activeFlow = undefined;
  }

  /** After a flow finishes, resume the most recently suspended one and re-prompt it. */
  private async resumeIfIdle(conversation: Conversation, request: RequestContext, replies: BotReply[], events: TurnEvent[]): Promise<void> {
    if (conversation.activeFlow || conversation.status !== 'ACTIVE') return;
    const next = conversation.suspendedFlows.shift();
    if (!next) return;
    const flow = this.deps.flows.get(next.flowId);
    if (!flow) return;
    replies.push({ text: `Now, back to ${flow.label}.` });
    conversation.activeFlow = next;
    const outcome = await stepFlow(flow, next, this.context(conversation, request));
    this.applyOutcome(conversation, flow, outcome, replies, events);
  }

  private isAllowed(flow: FlowDefinition, principal: Principal): boolean {
    return !flow.allowedRoles || principal.roles.some((r) => flow.allowedRoles!.includes(r));
  }

  private context(conversation: Conversation, request: RequestContext): FlowContext {
    const runStarted = conversation.activeFlow?.startedAt ?? this.clock().toISOString();
    return {
      conversation,
      principal: conversation.principal,
      slots: conversation.activeFlow?.slots ?? {},
      clients: this.deps.clients,
      request,
      logger: this.deps.logger.child({ conversationId: conversation.id, correlationId: request.correlationId }),
      idempotencyKey: (purpose) => `chatbot:${conversation.id}:${runStarted}:${purpose}`,
      scratch: {},
    };
  }
}
