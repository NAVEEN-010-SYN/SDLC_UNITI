import { randomUUID } from 'crypto';
import { AnalyticsSink } from '../analytics/analyticsEmitter';
import { RequestContext } from '../clients/httpClient';
import { DialogEngine, greeting, TurnEvent } from '../dialog/dialogEngine';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { BotReply, Channel, Conversation, IntentPrediction, Page, Principal, TranscriptEntry } from '../domain/types';
import { Logger } from '../logger';
import { IntentClassifier } from '../nlu/intentClassifier';
import { redactText } from '../privacy/piiRedactor';
import { ConversationRepository } from '../session/conversationRepository';
import { renderTranscript, TranscriptRepository } from '../transcripts/transcriptRepository';

/**
 * Application service for chatbot conversations. Orchestrates: ownership checks,
 * input validation, NLU, the dialog engine, optimistic-concurrency persistence,
 * transcript writes (redacted) and analytics. Transport-agnostic: used by both
 * the REST controller and the WebSocket gateway.
 */

export const MAX_MESSAGE_LENGTH = 1000;
const HISTORY_TURNS = 6;
const SAVE_ATTEMPTS = 2;

export interface HandoffPublisher {
  /** Notifies the agent desk; receives a redacted transcript for context. */
  publish(conversation: Conversation, transcript: string): Promise<void>;
}

export interface MessageResult {
  conversation: ConversationView;
  replies: BotReply[];
  intent: IntentPrediction['intent'];
  confidence: number;
}

/** Public projection of a conversation (no slot values, which may contain PII). */
export interface ConversationView {
  id: string;
  status: Conversation['status'];
  channel: Channel;
  activeFlow?: string;
  awaiting?: string;
  createdAt: string;
  updatedAt: string;
  handoff?: { queue: string; requestedAt: string; ticketId?: string };
}

export function toView(conversation: Conversation): ConversationView {
  return {
    id: conversation.id,
    status: conversation.status,
    channel: conversation.channel,
    activeFlow: conversation.activeFlow?.flowId,
    awaiting: conversation.activeFlow?.state,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    handoff: conversation.handoff
      ? { queue: conversation.handoff.queue, requestedAt: conversation.handoff.requestedAt, ticketId: conversation.handoff.ticketId }
      : undefined,
  };
}

export interface ConversationServiceDeps {
  repository: ConversationRepository;
  transcripts: TranscriptRepository;
  classifier: IntentClassifier;
  engine: DialogEngine;
  analytics: AnalyticsSink;
  handoff: HandoffPublisher;
  logger: Logger;
  clock?: () => Date;
  idFactory?: () => string;
}

export class ConversationService {
  private readonly clock: () => Date;
  private readonly idFactory: () => string;

  constructor(private readonly deps: ConversationServiceDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.idFactory = deps.idFactory ?? randomUUID;
  }

  async start(principal: Principal, channel: Channel): Promise<{ conversation: ConversationView; replies: BotReply[] }> {
    const now = this.clock().toISOString();
    const conversation: Conversation = {
      id: this.idFactory(),
      principal,
      channel,
      status: 'ACTIVE',
      suspendedFlows: [],
      fallbackCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.repository.create(conversation);
    const reply = greeting(principal);
    await this.deps.transcripts.append({ conversationId: conversation.id, author: 'BOT', text: reply.text });
    this.deps.analytics.track('conversation_started', conversation.id, principal.userId, { channel });
    return { conversation: toView(conversation), replies: [reply] };
  }

  async get(conversationId: string, principal: Principal): Promise<ConversationView> {
    const stored = await this.load(conversationId, principal);
    return toView(stored.conversation);
  }

  async listForUser(principal: Principal): Promise<ConversationView[]> {
    return (await this.deps.repository.listByUser(principal.userId)).map(toView);
  }

  async transcript(conversationId: string, principal: Principal, page: number, pageSize: number): Promise<Page<TranscriptEntry>> {
    await this.load(conversationId, principal);
    return this.deps.transcripts.list(conversationId, page, pageSize);
  }

  async handleMessage(conversationId: string, principal: Principal, text: string, request: RequestContext): Promise<MessageResult> {
    const clean = validateMessage(text);

    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
      const stored = await this.load(conversationId, principal);
      const conversation = stored.conversation;

      if (conversation.status === 'ENDED') {
        throw new ConflictError('This conversation has ended. Start a new one to continue.');
      }
      if (conversation.status === 'HANDED_OFF') {
        await this.deps.transcripts.append({ conversationId, author: 'USER', text: clean });
        const reply = { text: "Thanks - I've passed that on. An agent will reply here shortly." };
        return { conversation: toView(conversation), replies: [reply], intent: 'TALK_TO_AGENT', confidence: 1 };
      }

      const history = (await this.deps.transcripts.recent(conversationId, HISTORY_TURNS))
        .filter((e) => e.author === 'USER')
        .map((e) => e.text);
      const prediction = await this.deps.classifier.classify(clean, { history, correlationId: request.correlationId });
      const turn = await this.deps.engine.handleTurn(conversation, clean, prediction, request);
      conversation.updatedAt = this.clock().toISOString();

      const saved = await this.deps.repository.save(conversation, stored.version);
      if (!saved) {
        // Another message was processed concurrently; retry once against the fresh state.
        this.deps.logger.warn('conversation version conflict', { conversationId, attempt, correlationId: request.correlationId });
        continue;
      }

      await this.recordTurn(conversation, clean, prediction, turn.replies);
      this.emitAnalytics(conversation, prediction, turn.events, clean);
      if (conversation.status === 'HANDED_OFF' && turn.events.some((e) => e.type === 'handoff_requested')) {
        await this.publishHandoff(conversation);
      }
      return { conversation: toView(conversation), replies: turn.replies, intent: prediction.intent, confidence: prediction.confidence };
    }
    throw new ConflictError('The conversation was updated by another message. Please resend.');
  }

  async end(conversationId: string, principal: Principal): Promise<ConversationView> {
    const stored = await this.load(conversationId, principal);
    const conversation = stored.conversation;
    if (conversation.status === 'ENDED') return toView(conversation);
    conversation.status = 'ENDED';
    conversation.activeFlow = undefined;
    conversation.suspendedFlows = [];
    conversation.updatedAt = this.clock().toISOString();
    if (!(await this.deps.repository.save(conversation, stored.version))) {
      throw new ConflictError('The conversation changed while ending it. Please retry.');
    }
    this.deps.analytics.track('conversation_ended', conversationId, principal.userId, { reason: 'user_closed' });
    return toView(conversation);
  }

  /** Records a message from a live agent (handed-off conversations only). */
  async agentMessage(conversationId: string, agent: Principal, text: string): Promise<TranscriptEntry> {
    if (!agent.roles.includes('SUPPORT_AGENT')) throw new ForbiddenError('Only support agents can post agent messages');
    const stored = await this.deps.repository.get(conversationId);
    if (!stored) throw new NotFoundError('Conversation', conversationId);
    if (stored.conversation.status !== 'HANDED_OFF') throw new ConflictError('Conversation has not been handed off to an agent');
    return this.deps.transcripts.append({ conversationId, author: 'AGENT', text: validateMessage(text) });
  }

  private async load(conversationId: string, principal: Principal) {
    const stored = await this.deps.repository.get(conversationId);
    if (!stored) throw new NotFoundError('Conversation', conversationId);
    const owner = stored.conversation.principal.userId === principal.userId;
    if (!owner && !principal.roles.includes('SUPPORT_AGENT')) {
      // Do not reveal existence of other users' conversations.
      throw new NotFoundError('Conversation', conversationId);
    }
    return stored;
  }

  private async recordTurn(conversation: Conversation, text: string, prediction: IntentPrediction, replies: BotReply[]): Promise<void> {
    await this.deps.transcripts.append({
      conversationId: conversation.id,
      author: 'USER',
      text,
      intent: prediction.intent,
      confidence: prediction.confidence,
    });
    for (const reply of replies) {
      await this.deps.transcripts.append({ conversationId: conversation.id, author: 'BOT', text: reply.text });
    }
  }

  private emitAnalytics(conversation: Conversation, prediction: IntentPrediction, events: TurnEvent[], text: string): void {
    const { analytics } = this.deps;
    const userId = conversation.principal.userId;
    analytics.track('intent_classified', conversation.id, userId, {
      intent: prediction.intent,
      confidence: Number(prediction.confidence.toFixed(3)),
      source: prediction.source,
    });
    for (const event of events) {
      analytics.track(event.type, conversation.id, userId, {
        flowId: event.flowId,
        outcome: event.outcome,
        utterance: event.type === 'fallback' ? redactText(text).slice(0, 200) : undefined,
      });
    }
  }

  private async publishHandoff(conversation: Conversation): Promise<void> {
    try {
      const entries = await this.deps.transcripts.recent(conversation.id, 50);
      await this.deps.handoff.publish(conversation, renderTranscript(entries));
    } catch (error) {
      // The handoff ticket already exists, so an agent will still pick it up.
      this.deps.logger.error('handoff publish failed', { conversationId: conversation.id, error });
    }
  }
}

export function validateMessage(text: unknown): string {
  if (typeof text !== 'string') throw new ValidationError([{ field: 'text', message: 'must be a string' }]);
  // Strip control characters except newlines/tabs and collapse excessive whitespace.
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (clean.length === 0) throw new ValidationError([{ field: 'text', message: 'must not be empty' }]);
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError([{ field: 'text', message: `must be at most ${MAX_MESSAGE_LENGTH} characters` }]);
  }
  return clean;
}
