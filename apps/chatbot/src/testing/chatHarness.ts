import { AnalyticsEvent, AnalyticsEventName, AnalyticsSink } from '../analytics/analyticsEmitter';
import { DialogEngine, TurnEvent } from '../dialog/dialogEngine';
import { defaultFlowRegistry } from '../dialog/flows';
import { BotReply, Conversation, IntentPrediction, Principal } from '../domain/types';
import { silentLogger } from '../logger';
import { CompositeIntentClassifier } from '../nlu/intentClassifier';
import { NullLlmProvider } from '../nlu/llmProvider';
import { RulesMatcher } from '../nlu/rulesMatcher';
import { ACCOUNT_ID, FakeClients, fakeClients, OPEN_HOURS_CLOCK } from './fakes';

/**
 * Drives the real classifier + dialog engine turn by turn against fake platform
 * clients, so flow tests read like the conversation a customer would have.
 */

export interface HarnessTurn {
  prediction: IntentPrediction;
  replies: BotReply[];
  events: TurnEvent[];
  /** All reply texts of the turn joined by newlines, for concise assertions. */
  text: string;
}

export interface HarnessOptions {
  principal?: Partial<Principal>;
  clients?: FakeClients;
  clock?: () => Date;
}

export function principal(overrides: Partial<Principal> = {}): Principal {
  return { userId: 'user-1', accountId: ACCOUNT_ID, roles: ['CONSUMER'], displayName: 'Jane Customer', ...overrides };
}

export function newConversation(owner: Principal, now: Date): Conversation {
  const iso = now.toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    principal: owner,
    channel: 'REST',
    status: 'ACTIVE',
    suspendedFlows: [],
    fallbackCount: 0,
    createdAt: iso,
    updatedAt: iso,
  };
}

export class ChatHarness {
  readonly clients: FakeClients;
  readonly conversation: Conversation;
  private readonly engine: DialogEngine;
  private readonly classifier = new CompositeIntentClassifier({
    rules: new RulesMatcher(),
    llm: new NullLlmProvider(),
    minConfidence: 0.55,
    logger: silentLogger,
  });
  private turnCount = 0;

  constructor(options: HarnessOptions = {}) {
    const clock = options.clock ?? OPEN_HOURS_CLOCK;
    this.clients = options.clients ?? fakeClients();
    this.conversation = newConversation(principal(options.principal), clock());
    this.engine = new DialogEngine({ flows: defaultFlowRegistry(clock), clients: this.clients, logger: silentLogger, clock });
  }

  async say(text: string): Promise<HarnessTurn> {
    this.turnCount += 1;
    const prediction = await this.classifier.classify(text);
    const result = await this.engine.handleTurn(this.conversation, text, prediction, { correlationId: `test-turn-${this.turnCount}` });
    return { prediction, ...result, text: result.replies.map((r) => r.text).join('\n') };
  }

  get activeFlowId(): string | undefined {
    return this.conversation.activeFlow?.flowId;
  }

  get awaiting(): string | undefined {
    return this.conversation.activeFlow?.state;
  }
}

export function outcomeOf(turn: HarnessTurn, flowId: string): string | undefined {
  return turn.events.find((e) => (e.type === 'flow_completed' || e.type === 'flow_abandoned') && e.flowId === flowId)?.outcome;
}

/** Analytics sink that records events in memory for assertions. */
export class RecordingAnalytics implements AnalyticsSink {
  readonly events: Array<{ name: AnalyticsEventName; conversationId: string; userId: string; properties: AnalyticsEvent['properties'] }> = [];

  track(name: AnalyticsEventName, conversationId: string, userId: string, properties: AnalyticsEvent['properties'] = {}): void {
    this.events.push({ name, conversationId, userId, properties });
  }

  names(): AnalyticsEventName[] {
    return this.events.map((e) => e.name);
  }

  async flush(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }
}
