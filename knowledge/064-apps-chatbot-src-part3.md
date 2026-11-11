# Customer support chatbot: apps/chatbot/src (part 3 of 4)

- **Application:** Customer support chatbot
- **Tech stack:** Node.js (Express, TypeScript)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 17

## Files

- `apps/chatbot/src/dialog/stateMachine.ts` (243 lines)
- `apps/chatbot/src/domain/errors.ts` (93 lines)
- `apps/chatbot/src/domain/money.test.ts` (31 lines)
- `apps/chatbot/src/domain/money.ts` (34 lines)
- `apps/chatbot/src/domain/types.ts` (139 lines)
- `apps/chatbot/src/gateway/gatewaySession.test.ts` (111 lines)
- `apps/chatbot/src/gateway/gatewaySession.ts` (168 lines)
- `apps/chatbot/src/gateway/protocol.ts` (77 lines)
- `apps/chatbot/src/gateway/websocketGateway.ts` (166 lines)
- `apps/chatbot/src/http/middleware.ts` (151 lines)
- `apps/chatbot/src/http/routes.test.ts` (168 lines)
- `apps/chatbot/src/http/routes.ts` (144 lines)
- `apps/chatbot/src/logger.ts` (66 lines)
- `apps/chatbot/src/nlu/entityExtractor.test.ts` (38 lines)
- `apps/chatbot/src/nlu/entityExtractor.ts` (94 lines)
- `apps/chatbot/src/nlu/intentClassifier.test.ts` (93 lines)
- `apps/chatbot/src/nlu/intentClassifier.ts` (104 lines)

## apps/chatbot/src/dialog/stateMachine.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/stateMachine.ts`.

```typescript
import { BotReply, Conversation, Entity, FlowState, IntentName, Principal, SlotValues } from '../domain/types';
import { PlatformClients } from '../clients/platformClients';
import { RequestContext } from '../clients/httpClient';
import { Logger } from '../logger';
import { SlotValidator } from './slots';

/**
 * Declarative dialog flows as finite state machines.
 *
 * A flow is a graph of named states of three kinds:
 *  - `slot`    collects and validates one value from the user (skipped if already filled)
 *  - `confirm` asks a yes/no question and branches
 *  - `action`  runs business logic (API calls) and picks the next state
 *
 * The terminal pseudo-state is `END`. Flows may request an agent handoff by
 * returning `handoff` from an action.
 */

export const END = 'END';

export interface FlowContext {
  conversation: Conversation;
  principal: Principal;
  slots: SlotValues;
  clients: PlatformClients;
  request: RequestContext;
  logger: Logger;
  /** Stable key per (conversation, flow run, purpose) for idempotent writes. */
  idempotencyKey(purpose: string): string;
  /** Scratch data shared between action states within one turn (not persisted). */
  scratch: Record<string, unknown>;
}

type Dynamic<T> = T | ((ctx: FlowContext) => T);

export interface SlotState {
  kind: 'slot';
  slot: string;
  /** Static validator, or one built from context (e.g. options stored in earlier slots). */
  validator: SlotValidator | ((ctx: FlowContext) => SlotValidator);
  prompt: Dynamic<BotReply>;
  next: Dynamic<string>;
  /** Attempts allowed before giving up; defaults to 3. */
  maxRetries?: number;
  /** Free-text slots (descriptions) must not be hijacked by intent detection. */
  captureFreeText?: boolean;
  /** Optional async default (e.g. postcode of the customer's only service). */
  autofill?: (ctx: FlowContext) => Promise<string | number | boolean | undefined>;
}

export interface ConfirmState {
  kind: 'confirm';
  prompt: Dynamic<BotReply>;
  onYes: Dynamic<string>;
  onNo: Dynamic<string>;
}

export interface ActionResult {
  replies?: BotReply[];
  next: string;
  handoff?: { queue: string; reason: string; ticketId?: string };
  /** Marks the outcome for analytics, e.g. "resolved", "ticket_created". */
  outcome?: string;
}

export interface ActionState {
  kind: 'action';
  run: (ctx: FlowContext) => Promise<ActionResult>;
}

export type StateDefinition = SlotState | ConfirmState | ActionState;

export interface FlowDefinition {
  id: string;
  intent: IntentName;
  /** Human label used when offering to resume a suspended flow. */
  label: string;
  initial: string;
  states: Record<string, StateDefinition>;
  /** Roles allowed to run this flow; undefined means any authenticated user. */
  allowedRoles?: Principal['roles'];
  /** Extra prefill for values that are not slot states (e.g. a requested speed). */
  prefill?: (entities: Entity[]) => SlotValues;
}

export interface StepOutcome {
  flow: FlowState | undefined;
  replies: BotReply[];
  handoff?: ActionResult['handoff'];
  outcome?: string;
  /** True when a slot exhausted its retries. */
  abandoned?: boolean;
}

const MAX_TRANSITIONS_PER_TURN = 25;
const DEFAULT_SLOT_RETRIES = 3;

function resolve<T>(value: Dynamic<T>, ctx: FlowContext): T {
  return typeof value === 'function' ? (value as (c: FlowContext) => T)(ctx) : value;
}

export class FlowDefinitionError extends Error {}

/** Static validation: every referenced state exists and the initial state is defined. */
export function validateFlow(flow: FlowDefinition): void {
  const names = new Set(Object.keys(flow.states));
  if (!names.has(flow.initial)) throw new FlowDefinitionError(`${flow.id}: initial state "${flow.initial}" is undefined`);
  for (const [name, state] of Object.entries(flow.states)) {
    const targets: unknown[] =
      state.kind === 'slot' ? [state.next] : state.kind === 'confirm' ? [state.onYes, state.onNo] : [];
    for (const target of targets) {
      if (typeof target === 'string' && target !== END && !names.has(target)) {
        throw new FlowDefinitionError(`${flow.id}.${name}: transition to unknown state "${target}"`);
      }
    }
  }
}

export function startFlow(flow: FlowDefinition, prefill: SlotValues = {}, now = new Date()): FlowState {
  return { flowId: flow.id, state: flow.initial, slots: { ...prefill }, retries: 0, startedAt: now.toISOString() };
}

/**
 * Pre-fills any slot of the flow whose validator declares an entity type found in the utterance.
 */
export function prefillFromEntities(flow: FlowDefinition, entities: Entity[]): SlotValues {
  const values: SlotValues = {};
  for (const state of Object.values(flow.states)) {
    if (state.kind !== 'slot' || typeof state.validator === 'function' || !state.validator.entity) continue;
    const entityType = state.validator.entity;
    if (!entities.some((e) => e.type === entityType)) continue;
    const parsed = state.validator.parse('', entities);
    if (parsed.ok) values[state.slot] = parsed.value;
  }
  return { ...(flow.prefill?.(entities) ?? {}), ...values };
}

/**
 * Advances the flow. If `input` is provided it is consumed by the current
 * waiting state (slot or confirm). The machine then runs forward through
 * filled slots and action states until it needs more input or reaches END.
 */
export async function stepFlow(
  flow: FlowDefinition,
  state: FlowState,
  ctx: FlowContext,
  input?: { text: string; entities: Entity[] },
): Promise<StepOutcome> {
  const current: FlowState = { ...state, slots: { ...state.slots } };
  ctx.slots = current.slots;
  const replies: BotReply[] = [];
  let handoff: ActionResult['handoff'];
  let outcome: string | undefined;
  let pendingInput = input;

  for (let i = 0; i < MAX_TRANSITIONS_PER_TURN; i += 1) {
    if (current.state === END) return { flow: undefined, replies, handoff, outcome };
    const def = flow.states[current.state];
    if (!def) throw new FlowDefinitionError(`${flow.id}: unknown state "${current.state}"`);

    if (def.kind === 'action') {
      const result = await def.run(ctx);
      replies.push(...(result.replies ?? []));
      handoff = result.handoff ?? handoff;
      outcome = result.outcome ?? outcome;
      transition(current, result.next);
      continue;
    }

    if (def.kind === 'slot') {
      if (current.slots[def.slot] === undefined && def.autofill) {
        const auto = await def.autofill(ctx);
        if (auto !== undefined) current.slots[def.slot] = auto;
      }
      if (current.slots[def.slot] !== undefined) {
        transition(current, resolve(def.next, ctx));
        continue;
      }
      if (!pendingInput) {
        replies.push(resolve(def.prompt, ctx));
        return { flow: current, replies, handoff, outcome };
      }
      const validator = typeof def.validator === 'function' ? def.validator(ctx) : def.validator;
      const parsed = validator.parse(pendingInput.text, pendingInput.entities);
      pendingInput = undefined;
      if (parsed.ok) {
        current.slots[def.slot] = parsed.value;
        transition(current, resolve(def.next, ctx));
        continue;
      }
      current.retries += 1;
      if (current.retries >= (def.maxRetries ?? DEFAULT_SLOT_RETRIES)) {
        replies.push({ text: "Sorry, I'm having trouble with that. Let's leave this here for now." });
        return { flow: undefined, replies, handoff, outcome: 'abandoned', abandoned: true };
      }
      replies.push({ text: parsed.error });
      return { flow: current, replies, handoff, outcome };
    }

    // confirm
    if (!pendingInput) {
      replies.push(resolve(def.prompt, ctx));
      return { flow: current, replies, handoff, outcome };
    }
    const answer = interpretYesNo(pendingInput.text);
    pendingInput = undefined;
    if (answer === undefined) {
      current.retries += 1;
      if (current.retries >= DEFAULT_SLOT_RETRIES) {
        replies.push({ text: "I didn't catch that, so I've stopped here. Ask again any time." });
        return { flow: undefined, replies, handoff, outcome: 'abandoned', abandoned: true };
      }
      const prompt = resolve(def.prompt, ctx);
      replies.push({ ...prompt, text: `Please answer yes or no. ${prompt.text}` });
      return { flow: current, replies, handoff, outcome };
    }
    transition(current, resolve(answer ? def.onYes : def.onNo, ctx));
  }
  throw new FlowDefinitionError(`${flow.id}: exceeded ${MAX_TRANSITIONS_PER_TURN} transitions in one turn (cycle?)`);
}

function transition(flow: FlowState, next: string): void {
  flow.state = next;
  flow.retries = 0;
}

/** Re-prompts the current waiting state without consuming input (used on resume). */
export async function repromptFlow(flow: FlowDefinition, state: FlowState, ctx: FlowContext): Promise<StepOutcome> {
  return stepFlow(flow, state, ctx);
}

export function interpretYesNo(text: string): boolean | undefined {
  const clean = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (/^(intent:affirm|y|yes|yeah|yep|sure|ok|okay|please do|go ahead|yes please|correct|confirm)$/.test(clean)) return true;
  if (/^(intent:deny|n|no|nope|nah|no thanks|not now|don't|dont)$/.test(clean)) return false;
  return undefined;
}

export function isWaitingForInput(flow: FlowDefinition, state: FlowState): boolean {
  const def = flow.states[state.state];
  return def !== undefined && def.kind !== 'action';
}
```

## apps/chatbot/src/domain/errors.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/domain/errors.ts`.

```typescript
/**
 * Application error hierarchy mapped to RFC 7807 problem details by the HTTP layer.
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

const PROBLEM_BASE = 'https://errors.uniti.example/chatbot';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    message?: string,
  ) {
    super(message ?? title);
    this.name = new.target.name;
  }

  toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return {
      type: `${PROBLEM_BASE}/${this.code}`,
      title: this.title,
      status: this.status,
      detail: this.message !== this.title ? this.message : undefined,
      instance,
      correlationId,
    };
  }
}

export class ValidationError extends AppError {
  constructor(readonly fieldErrors: Array<{ field: string; message: string }>) {
    super(400, 'validation-failed', 'Request validation failed', fieldErrors.map((e) => `${e.field}: ${e.message}`).join('; '));
  }

  override toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return { ...super.toProblem(instance, correlationId), errors: this.fieldErrors };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'A valid bearer token is required') {
    super(401, 'unauthorized', 'Unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'forbidden', 'Forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflict', 'Conflict', message);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'rate-limited', 'Too many messages', `Retry after ${retryAfterSeconds}s`);
  }
}

export class DownstreamError extends AppError {
  constructor(
    readonly service: string,
    readonly upstreamStatus: number | undefined,
    message: string,
  ) {
    super(502, 'downstream-failure', 'Downstream service failure', `${service}: ${message}`);
  }

  get retryable(): boolean {
    return this.upstreamStatus === undefined || this.upstreamStatus >= 500 || this.upstreamStatus === 429;
  }
}
```

## apps/chatbot/src/domain/money.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/domain/money.test.ts`.

```typescript
import { addMoney, formatMoney, priceDelta } from './money';

describe('money', () => {
  it('formats minor units with grouping and padding', () => {
    expect(formatMoney({ amountMinor: 123456789, currency: 'GBP' })).toBe('£1,234,567.89');
    expect(formatMoney({ amountMinor: 5, currency: 'GBP' })).toBe('£0.05');
    expect(formatMoney({ amountMinor: -2500, currency: 'USD' })).toBe('-$25.00');
  });

  it('falls back to currency code for unknown symbols', () => {
    expect(formatMoney({ amountMinor: 1000, currency: 'NZD' })).toBe('NZD 10.00');
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatMoney({ amountMinor: 10.5, currency: 'GBP' })).toThrow(TypeError);
  });

  it('adds amounts of the same currency and rejects mismatches', () => {
    expect(addMoney({ amountMinor: 100, currency: 'GBP' }, { amountMinor: 250, currency: 'GBP' })).toEqual({
      amountMinor: 350,
      currency: 'GBP',
    });
    expect(() => addMoney({ amountMinor: 1, currency: 'GBP' }, { amountMinor: 1, currency: 'EUR' })).toThrow();
  });

  it('computes signed price deltas', () => {
    expect(priceDelta({ amountMinor: 3500, currency: 'GBP' }, { amountMinor: 4999, currency: 'GBP' }).amountMinor).toBe(1499);
    expect(priceDelta({ amountMinor: 4999, currency: 'GBP' }, { amountMinor: 3500, currency: 'GBP' }).amountMinor).toBe(-1499);
  });
});
```

## apps/chatbot/src/domain/money.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/domain/money.ts`.

```typescript
import { Money } from './types';

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

/** Formats integer minor units without ever going through floating point arithmetic. */
export function formatMoney(money: Money): string {
  if (!Number.isInteger(money.amountMinor)) {
    throw new TypeError(`amountMinor must be an integer, got ${money.amountMinor}`);
  }
  const negative = money.amountMinor < 0;
  const abs = Math.abs(money.amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = CURRENCY_SYMBOLS[money.currency] ?? `${money.currency} `;
  return `${negative ? '-' : ''}${symbol}${groupedMajor}.${minor.toString().padStart(2, '0')}`;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  return addMoney(a, { amountMinor: -b.amountMinor, currency: b.currency });
}

/** Signed monthly difference between two plan prices, used in upgrade quotes. */
export function priceDelta(current: Money, target: Money): Money {
  return subtractMoney(target, current);
}
```

## apps/chatbot/src/domain/types.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/domain/types.ts`.

```typescript
/**
 * Core domain types for the chatbot. Vocabulary follows CONVENTIONS.md
 * (Account, Service, Ticket, Invoice, roles, money in minor units).
 */

export type Role =
  | 'CONSUMER'
  | 'BUSINESS_ADMIN'
  | 'BUSINESS_USER'
  | 'PARTNER_ADMIN'
  | 'PARTNER_AGENT'
  | 'WHOLESALE_BUYER'
  | 'SUPPORT_AGENT';

export type Channel = 'WEB_WIDGET' | 'REST';

export interface Principal {
  userId: string;
  accountId: string;
  roles: Role[];
  displayName?: string;
}

export interface Money {
  /** Integer minor units (cents/pence). */
  amountMinor: number;
  currency: string;
}

export type IntentName =
  | 'CHECK_OUTAGE'
  | 'BILL_ENQUIRY'
  | 'RESET_ROUTER'
  | 'PLAN_UPGRADE'
  | 'RAISE_TICKET'
  | 'TALK_TO_AGENT'
  | 'GREETING'
  | 'GOODBYE'
  | 'AFFIRM'
  | 'DENY'
  | 'CANCEL'
  | 'FALLBACK';

export interface Entity {
  type: EntityType;
  value: string;
  /** Character offsets in the original (unredacted) utterance. */
  start: number;
  end: number;
}

export type EntityType =
  | 'ACCOUNT_ID'
  | 'POSTCODE'
  | 'INVOICE_ID'
  | 'TICKET_ID'
  | 'SPEED'
  | 'PHONE'
  | 'EMAIL'
  | 'DATE';

export interface IntentPrediction {
  intent: IntentName;
  confidence: number;
  source: 'rules' | 'llm' | 'context';
  entities: Entity[];
}

export type MessageAuthor = 'USER' | 'BOT' | 'AGENT' | 'SYSTEM';

export interface QuickReply {
  label: string;
  payload: string;
}

export interface BotReply {
  text: string;
  quickReplies?: QuickReply[];
  /** Structured card data the widget may render (invoice summary, plan list, ...). */
  card?: ReplyCard;
}

export type ReplyCard =
  | { kind: 'INVOICE'; invoiceId: string; total: Money; dueDate: string; status: string }
  | { kind: 'PLANS'; plans: Array<{ code: string; name: string; downloadMbps: number; monthly: Money }> }
  | { kind: 'TICKET'; ticketId: string; priority: TicketPriority; status: TicketStatus }
  | { kind: 'OUTAGE'; region: string; status: string; estimatedRestore?: string };

export interface TranscriptEntry {
  id: string;
  conversationId: string;
  author: MessageAuthor;
  /** Already PII-redacted text; raw text is never persisted. */
  text: string;
  intent?: IntentName;
  confidence?: number;
  createdAt: string;
}

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';

export type ConversationStatus = 'ACTIVE' | 'HANDED_OFF' | 'ENDED';

export interface SlotValues {
  [slot: string]: string | number | boolean | undefined;
}

export interface FlowState {
  flowId: string;
  state: string;
  slots: SlotValues;
  /** How many times the current slot prompt has been re-asked after invalid input. */
  retries: number;
  startedAt: string;
}

export interface Conversation {
  id: string;
  principal: Principal;
  channel: Channel;
  status: ConversationStatus;
  activeFlow?: FlowState;
  /** Flows suspended by an interrupting intent, resumed LIFO. */
  suspendedFlows: FlowState[];
  lastIntent?: IntentName;
  fallbackCount: number;
  createdAt: string;
  updatedAt: string;
  handoff?: { queue: string; requestedAt: string; reason: string; ticketId?: string };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
```

## apps/chatbot/src/gateway/gatewaySession.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/gateway/gatewaySession.test.ts`.

```typescript
import { createApplication } from '../app';
import { silentLogger } from '../logger';
import { RecordingAnalytics } from '../testing/chatHarness';
import { fakeClients, OPEN_HOURS_CLOCK, signToken, testConfig } from '../testing/fakes';
import { GatewaySession } from './gatewaySession';
import { ServerFrame } from './protocol';

function setup(maxMessages = 30) {
  const config = testConfig({ rateLimit: { windowMs: 60_000, maxMessages } });
  const application = createApplication(config, silentLogger, { clients: fakeClients(), analytics: new RecordingAnalytics(), clock: OPEN_HOURS_CLOCK });
  const frames: ServerFrame[] = [];
  const subscriptions: string[] = [];
  const session = new GatewaySession(
    {
      service: application.service,
      auth: config.auth,
      limiter: application.limiter,
      logger: silentLogger,
      onSubscribe: (conversationId) => subscriptions.push(conversationId),
    },
    (frame) => frames.push(frame),
  );
  const send = (frame: object) => session.receive(JSON.stringify(frame));
  return { session, frames, subscriptions, send, limiter: application.limiter };
}

async function authenticatedConversation(maxMessages?: number) {
  const ctx = setup(maxMessages);
  await ctx.send({ type: 'auth', token: signToken() });
  await ctx.send({ type: 'start' });
  const started = ctx.frames.find((f) => f.type === 'conversation') as Extract<ServerFrame, { type: 'conversation' }>;
  return { ...ctx, conversationId: started.conversation.id };
}

describe('GatewaySession', () => {
  it('answers pings before authentication but nothing else', async () => {
    const { send, frames } = setup();
    await send({ type: 'ping' });
    await send({ type: 'start' });
    expect(frames).toEqual([{ type: 'pong' }, { type: 'error', code: 'unauthenticated', message: 'Send an auth frame first' }]);
  });

  it('reports malformed frames without dropping the connection state', async () => {
    const { session, frames } = setup();
    await session.receive('{not json');
    await session.receive(JSON.stringify({ type: 'message', conversationId: 'c1' }));
    await session.receive(JSON.stringify({ type: 'teleport' }));
    expect(frames.map((f) => (f.type === 'error' ? f.code : f.type))).toEqual(['bad_json', 'bad_frame', 'unknown_type']);
  });

  it('rejects an invalid token and stays unauthenticated', async () => {
    const { send, frames, session } = setup();
    await send({ type: 'auth', token: 'not-a-jwt' });
    expect(frames[0]).toMatchObject({ type: 'error', code: 'unauthorized' });
    expect(session.authenticated).toBe(false);
  });

  it('starts a conversation, subscribes to it and routes messages through the dialog engine', async () => {
    const { send, frames, subscriptions, conversationId } = await authenticatedConversation();
    expect(frames[0]).toEqual({ type: 'ready', userId: 'user-1' });
    expect(subscriptions).toEqual([conversationId]);

    await send({ type: 'message', conversationId, text: 'my bill', clientMessageId: 'm-1' });
    const reply = frames[frames.length - 1];
    expect(reply).toMatchObject({ type: 'reply', inReplyTo: 'm-1', conversation: { activeFlow: 'bill_enquiry' } });
    expect(subscriptions).toEqual([conversationId]);
  });

  it('processes frames strictly in arrival order', async () => {
    const { session, frames, conversationId } = await authenticatedConversation();
    const ids = ['a', 'b', 'c'];
    await Promise.all(ids.map((id) => session.receive(JSON.stringify({ type: 'message', conversationId, text: 'hello', clientMessageId: id }))));
    const replies = frames.filter((f): f is Extract<ServerFrame, { type: 'reply' }> => f.type === 'reply');
    expect(replies.map((r) => r.inReplyTo)).toEqual(ids);
  });

  it('applies the shared per-user rate limit and tells the widget when to retry', async () => {
    const { send, frames, conversationId } = await authenticatedConversation(2);
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-1' });
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-2' });
    expect(frames[frames.length - 1]).toEqual({
      type: 'error',
      code: 'rate_limited',
      message: 'Too many messages. Try again in 60s.',
      inReplyTo: 'm-2',
      retryAfterSeconds: 60,
    });
  });

  it('shares its budget with the REST transport so switching transport does not bypass limits', async () => {
    const { send, frames, conversationId, limiter } = await authenticatedConversation(2);
    // The conversation start used one hit; simulate one REST message by the same user.
    expect(limiter.hit('user:user-1').allowed).toBe(true);
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-1' });
    expect(frames[frames.length - 1]).toMatchObject({ type: 'error', code: 'rate_limited' });
  });

  it('maps service errors to safe error frames', async () => {
    const { send, frames } = await authenticatedConversation();
    await send({ type: 'resume', conversationId: '00000000-0000-4000-8000-00000000dead' });
    expect(frames[frames.length - 1]).toMatchObject({ type: 'error', code: 'not-found' });
  });

  it('unsubscribes when the conversation is ended', async () => {
    const { send, frames, session, conversationId } = await authenticatedConversation();
    await send({ type: 'end', conversationId });
    expect(frames[frames.length - 1]).toEqual({ type: 'ended', conversationId });
    expect(session.subscriptions.has(conversationId)).toBe(false);
  });
});
```

## apps/chatbot/src/gateway/gatewaySession.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/gateway/gatewaySession.ts`.

```typescript
import { randomUUID } from 'crypto';
import { AuthConfig } from '../config';
import { ConversationService } from '../conversation/conversationService';
import { AppError } from '../domain/errors';
import { Principal } from '../domain/types';
import { verifyToken } from '../http/middleware';
import { Logger } from '../logger';
import { RateLimiter } from '../ratelimit/rateLimiter';
import { ClientFrame, FrameError, parseClientFrame, ServerFrame } from './protocol';

/**
 * Transport-independent state machine for one widget connection:
 * UNAUTHENTICATED --auth--> READY. Every frame after auth is routed to the
 * ConversationService. Kept separate from the `ws` socket so it can be unit
 * tested without network I/O.
 */

export interface SessionDeps {
  service: ConversationService;
  auth: AuthConfig;
  limiter: RateLimiter;
  logger: Logger;
  /** Called when the session starts or resumes a conversation (for agent fan-out). */
  onSubscribe(conversationId: string, session: GatewaySession): void;
}

export class GatewaySession {
  readonly id = randomUUID();
  private principal?: Principal;
  private token?: string;
  private readonly conversations = new Set<string>();
  /** Serialises frame handling so replies are delivered in order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: SessionDeps,
    private readonly send: (frame: ServerFrame) => void,
  ) {}

  get authenticated(): boolean {
    return this.principal !== undefined;
  }

  get subscriptions(): ReadonlySet<string> {
    return this.conversations;
  }

  receive(raw: string): Promise<void> {
    this.queue = this.queue.then(() => this.process(raw)).catch((error) => {
      this.deps.logger.error('gateway frame processing crashed', { sessionId: this.id, error });
    });
    return this.queue;
  }

  deliver(frame: ServerFrame): void {
    this.send(frame);
  }

  private async process(raw: string): Promise<void> {
    let frame: ClientFrame;
    try {
      frame = parseClientFrame(raw);
    } catch (error) {
      const fe = error as FrameError;
      this.send({ type: 'error', code: fe.code ?? 'bad_frame', message: fe.message });
      return;
    }

    if (frame.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }

    if (frame.type === 'auth') {
      this.authenticate(frame.token);
      return;
    }

    if (!this.principal) {
      this.send({ type: 'error', code: 'unauthenticated', message: 'Send an auth frame first' });
      return;
    }

    const inReplyTo = frame.type === 'message' ? frame.clientMessageId : undefined;
    try {
      await this.dispatch(frame, this.principal);
    } catch (error) {
      this.send(this.errorFrame(error, inReplyTo));
    }
  }

  private authenticate(token: string): void {
    try {
      this.principal = verifyToken(token, this.deps.auth);
      this.token = token;
      this.send({ type: 'ready', userId: this.principal.userId });
    } catch (error) {
      this.principal = undefined;
      this.send(this.errorFrame(error));
    }
  }

  private async dispatch(frame: Exclude<ClientFrame, { type: 'auth' } | { type: 'ping' }>, principal: Principal): Promise<void> {
    switch (frame.type) {
      case 'start': {
        this.enforceRateLimit(principal);
        const result = await this.deps.service.start(principal, 'WEB_WIDGET');
        this.subscribe(result.conversation.id);
        this.send({ type: 'conversation', conversation: result.conversation, replies: result.replies });
        return;
      }
      case 'resume': {
        const conversation = await this.deps.service.get(frame.conversationId, principal);
        this.subscribe(conversation.id);
        this.send({ type: 'conversation', conversation, replies: [] });
        return;
      }
      case 'message': {
        this.enforceRateLimit(principal);
        const result = await this.deps.service.handleMessage(frame.conversationId, principal, frame.text, {
          correlationId: `ws-${this.id}-${frame.clientMessageId}`.slice(0, 128),
          bearerToken: this.token,
        });
        this.subscribe(frame.conversationId);
        this.send({
          type: 'reply',
          conversationId: frame.conversationId,
          inReplyTo: frame.clientMessageId,
          replies: result.replies,
          conversation: result.conversation,
        });
        return;
      }
      case 'end': {
        await this.deps.service.end(frame.conversationId, principal);
        this.conversations.delete(frame.conversationId);
        this.send({ type: 'ended', conversationId: frame.conversationId });
        return;
      }
    }
  }

  private enforceRateLimit(principal: Principal): void {
    const decision = this.deps.limiter.hit(`user:${principal.userId}`);
    if (!decision.allowed) {
      throw new FrameError('rate_limited', `Too many messages. Try again in ${decision.retryAfterSeconds}s.`, decision.retryAfterSeconds);
    }
  }

  private subscribe(conversationId: string): void {
    if (this.conversations.has(conversationId)) return;
    this.conversations.add(conversationId);
    this.deps.onSubscribe(conversationId, this);
  }

  private errorFrame(error: unknown, inReplyTo?: string): ServerFrame {
    if (error instanceof FrameError) {
      return { type: 'error', code: error.code, message: error.message, inReplyTo, retryAfterSeconds: error.retryAfterSeconds };
    }
    if (error instanceof AppError) {
      if (error.status >= 500) this.deps.logger.warn('gateway request failed', { sessionId: this.id, error });
      return { type: 'error', code: error.code, message: error.status >= 500 ? 'Something went wrong. Please try again.' : error.message, inReplyTo };
    }
    this.deps.logger.error('gateway unexpected error', { sessionId: this.id, error });
    return { type: 'error', code: 'internal', message: 'Something went wrong. Please try again.', inReplyTo };
  }
}
```

## apps/chatbot/src/gateway/protocol.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/gateway/protocol.ts`.

```typescript
import { BotReply } from '../domain/types';
import { ConversationView } from '../conversation/conversationService';

/**
 * Web chat widget WebSocket protocol (JSON text frames).
 * The bearer token is sent in the first frame rather than the URL so it never
 * appears in proxy/access logs.
 */

export type ClientFrame =
  | { type: 'auth'; token: string }
  | { type: 'start' }
  | { type: 'resume'; conversationId: string }
  | { type: 'message'; conversationId: string; text: string; clientMessageId: string }
  | { type: 'end'; conversationId: string }
  | { type: 'ping' };

export type ServerFrame =
  | { type: 'ready'; userId: string }
  | { type: 'conversation'; conversation: ConversationView; replies: BotReply[] }
  | { type: 'reply'; conversationId: string; inReplyTo: string; replies: BotReply[]; conversation: ConversationView }
  | { type: 'agent_message'; conversationId: string; text: string; at: string }
  | { type: 'ended'; conversationId: string }
  | { type: 'error'; code: string; message: string; inReplyTo?: string; retryAfterSeconds?: number }
  | { type: 'pong' };

export class FrameError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function requireString(frame: Record<string, unknown>, key: string, max = 256): string {
  const value = frame[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new FrameError('bad_frame', `"${key}" must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

/** Parses and validates an inbound frame; throws FrameError on anything malformed. */
export function parseClientFrame(raw: string): ClientFrame {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new FrameError('bad_json', 'Frame is not valid JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FrameError('bad_frame', 'Frame must be a JSON object');
  const frame = data as Record<string, unknown>;
  switch (frame.type) {
    case 'auth':
      return { type: 'auth', token: requireString(frame, 'token', 8192) };
    case 'start':
      return { type: 'start' };
    case 'resume':
      return { type: 'resume', conversationId: requireString(frame, 'conversationId', 64) };
    case 'message':
      return {
        type: 'message',
        conversationId: requireString(frame, 'conversationId', 64),
        text: requireString(frame, 'text', 2000),
        clientMessageId: requireString(frame, 'clientMessageId', 64),
      };
    case 'end':
      return { type: 'end', conversationId: requireString(frame, 'conversationId', 64) };
    case 'ping':
      return { type: 'ping' };
    default:
      throw new FrameError('unknown_type', `Unknown frame type "${String(frame.type)}"`);
  }
}
```

## apps/chatbot/src/gateway/websocketGateway.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/gateway/websocketGateway.ts`.

```typescript
import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { HandoffPublisher } from '../conversation/conversationService';
import { Conversation, TranscriptEntry } from '../domain/types';
import { Logger } from '../logger';
import { GatewaySession, SessionDeps } from './gatewaySession';
import { ServerFrame } from './protocol';

/**
 * WebSocket gateway for the embeddable chat widget, mounted at /api/v1/ws.
 * - Rejects upgrades from origins not on the allow-list.
 * - Closes sockets that do not authenticate within AUTH_TIMEOUT_MS.
 * - Pings every HEARTBEAT_MS and terminates peers that miss a pong.
 * - Fans out live-agent messages to every socket subscribed to a conversation.
 */

export const WS_PATH = '/api/v1/ws';
const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 8 * 1024;

export interface GatewayOptions {
  allowedOrigins: string[];
  logger: Logger;
  sessionDeps: Omit<SessionDeps, 'onSubscribe'>;
}

interface Peer {
  socket: WebSocket;
  session: GatewaySession;
  alive: boolean;
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((entry) => {
    if (entry === origin) return true;
    // Support wildcard subdomains: https://*.uniti.example
    const wildcard = /^(https?:\/\/)\*\.(.+)$/.exec(entry);
    if (!wildcard) return false;
    try {
      const url = new URL(origin);
      return `${url.protocol}//` === wildcard[1] && url.hostname.endsWith(`.${wildcard[2]}`);
    } catch {
      return false;
    }
  });
}

export class WebSocketGateway implements HandoffPublisher {
  private wss?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;
  private readonly peers = new Set<Peer>();
  private readonly byConversation = new Map<string, Set<GatewaySession>>();

  constructor(private readonly options: GatewayOptions) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: WS_PATH,
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: (info: { origin: string; req: IncomingMessage }) => {
        const ok = isOriginAllowed(info.origin, this.options.allowedOrigins);
        if (!ok) this.options.logger.warn('ws upgrade rejected: origin', { origin: info.origin });
        return ok;
      },
    });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private onConnection(socket: WebSocket): void {
    const session = new GatewaySession(
      {
        ...this.options.sessionDeps,
        onSubscribe: (conversationId, s) => this.subscribe(conversationId, s),
      },
      (frame) => this.sendFrame(socket, frame),
    );
    const peer: Peer = { socket, session, alive: true };
    this.peers.add(peer);

    const authTimer = setTimeout(() => {
      if (!session.authenticated) socket.close(4401, 'authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('pong', () => {
      peer.alive = true;
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(4400, 'binary frames not supported');
        return;
      }
      void session.receive(data.toString());
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      this.peers.delete(peer);
      for (const conversationId of session.subscriptions) this.unsubscribe(conversationId, session);
    });
    socket.on('error', (error) => this.options.logger.warn('ws socket error', { sessionId: session.id, error }));
  }

  private sendFrame(socket: WebSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  private subscribe(conversationId: string, session: GatewaySession): void {
    const set = this.byConversation.get(conversationId) ?? new Set<GatewaySession>();
    set.add(session);
    this.byConversation.set(conversationId, set);
  }

  private unsubscribe(conversationId: string, session: GatewaySession): void {
    const set = this.byConversation.get(conversationId);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) this.byConversation.delete(conversationId);
  }

  private sweep(): void {
    for (const peer of this.peers) {
      if (!peer.alive) {
        peer.socket.terminate();
        this.peers.delete(peer);
        continue;
      }
      peer.alive = false;
      peer.socket.ping();
    }
  }

  /** Pushes a live agent's message to the customer's open widget(s). */
  deliverAgentMessage(entry: TranscriptEntry): number {
    const sessions = this.byConversation.get(entry.conversationId);
    if (!sessions) return 0;
    for (const session of sessions) {
      session.deliver({ type: 'agent_message', conversationId: entry.conversationId, text: entry.text, at: entry.createdAt });
    }
    return sessions.size;
  }

  /** HandoffPublisher: informs connected widgets that an agent has been requested. */
  async publish(conversation: Conversation, transcript: string): Promise<void> {
    this.options.logger.info('handoff requested', {
      conversationId: conversation.id,
      queue: conversation.handoff?.queue,
      ticketId: conversation.handoff?.ticketId,
      transcriptLines: transcript.split('\n').length,
    });
  }

  get connectionCount(): number {
    return this.peers.size;
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const peer of this.peers) peer.socket.close(1001, 'server shutting down');
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }
}
```

## apps/chatbot/src/http/middleware.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/http/middleware.ts`.

```typescript
import { randomUUID } from 'crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthConfig } from '../config';
import { AppError, RateLimitedError, UnauthorizedError } from '../domain/errors';
import { Principal, Role } from '../domain/types';
import { Logger } from '../logger';
import { RateLimiter } from '../ratelimit/rateLimiter';

/** Express request augmented by our middleware. */
export interface ChatRequest extends Request {
  correlationId: string;
  principal?: Principal;
  bearerToken?: string;
}

const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_CORRELATION = /^[A-Za-z0-9._:-]{8,128}$/;
const KNOWN_ROLES: Role[] = ['CONSUMER', 'BUSINESS_ADMIN', 'BUSINESS_USER', 'PARTNER_ADMIN', 'PARTNER_AGENT', 'WHOLESALE_BUYER', 'SUPPORT_AGENT'];

/** Accepts a well-formed inbound correlation id or mints one, and echoes it back. */
export function correlationId(): RequestHandler {
  return (req, res, next) => {
    const inbound = req.header(CORRELATION_HEADER);
    const id = inbound && SAFE_CORRELATION.test(inbound) ? inbound : randomUUID();
    (req as ChatRequest).correlationId = id;
    res.setHeader('X-Correlation-Id', id);
    next();
  };
}

export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info('http request', {
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        correlationId: (req as ChatRequest).correlationId,
      });
    });
    next();
  };
}

export interface TokenClaims {
  sub?: string;
  account_id?: string;
  roles?: unknown;
  name?: string;
}

/** Verifies a bearer JWT and maps its claims onto a Principal. Shared with the WS gateway. */
export function verifyToken(token: string, config: AuthConfig): Principal {
  const key = config.publicKey ?? config.sharedSecret;
  if (!key) throw new UnauthorizedError('Token verification is not configured');
  let claims: TokenClaims;
  try {
    claims = jwt.verify(token, key, {
      algorithms: config.publicKey ? ['RS256'] : ['HS256'],
      issuer: config.issuer,
      audience: config.audience,
      clockTolerance: 30,
    }) as TokenClaims;
  } catch (error) {
    throw new UnauthorizedError(error instanceof Error ? `Invalid token: ${error.message}` : 'Invalid token');
  }
  if (!claims.sub || !claims.account_id) throw new UnauthorizedError('Token is missing sub or account_id');
  if (!/^ACC-\d{8}$/.test(claims.account_id)) throw new UnauthorizedError('Token account_id is malformed');
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((r): r is Role => KNOWN_ROLES.includes(r as Role)) : [];
  if (roles.length === 0) throw new UnauthorizedError('Token carries no recognised roles');
  return { userId: claims.sub, accountId: claims.account_id, roles, displayName: claims.name };
}

export function authenticate(config: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return next(new UnauthorizedError());
    try {
      const chatReq = req as ChatRequest;
      chatReq.principal = verifyToken(match[1], config);
      chatReq.bearerToken = match[1];
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const principal = (req as ChatRequest).principal;
    if (!principal || !principal.roles.some((r) => roles.includes(r))) {
      return next(new AppError(403, 'forbidden', 'Forbidden', `Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
}

/** Per-user message rate limit; sets standard RateLimit headers. */
export function rateLimit(limiter: RateLimiter): RequestHandler {
  return (req, res, next) => {
    const chatReq = req as ChatRequest;
    const key = chatReq.principal ? `user:${chatReq.principal.userId}` : `ip:${req.ip}`;
    const decision = limiter.hit(key);
    res.setHeader('RateLimit-Limit', String(decision.limit));
    res.setHeader('RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      return next(new RateLimitedError(decision.retryAfterSeconds));
    }
    next();
  };
}

/** Wraps async handlers so rejections reach the error middleware. */
export function asyncHandler(fn: (req: ChatRequest, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req as ChatRequest, res).catch(next);
  };
}

/** RFC 7807 error responder. Unknown errors become a generic 500 without leaking internals. */
export function problemHandler(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const correlation = (req as ChatRequest).correlationId;
    const isJsonSyntax = error instanceof SyntaxError && 'body' in (error as object);
    const appError =
      error instanceof AppError
        ? error
        : isJsonSyntax
          ? new AppError(400, 'malformed-json', 'Malformed JSON body')
          : new AppError(500, 'internal', 'Internal server error');

    if (appError.status >= 500) {
      logger.error('request failed', { error, correlationId: correlation, path: req.path });
    } else {
      logger.info('request rejected', { status: appError.status, code: appError.code, correlationId: correlation });
    }
    res.status(appError.status).type('application/problem+json').send(JSON.stringify(appError.toProblem(req.originalUrl, correlation)));
  };
}

export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => next(new AppError(404, 'route-not-found', 'Route not found', `${req.method} ${req.path} does not exist`));
}
```

## apps/chatbot/src/http/routes.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/http/routes.test.ts`.

```typescript
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApplication } from '../app';
import { AppConfig } from '../config';
import { silentLogger } from '../logger';
import { RecordingAnalytics } from '../testing/chatHarness';
import { fakeClients, OPEN_HOURS_CLOCK, signToken, testConfig } from '../testing/fakes';

function build(overrides: Partial<AppConfig> = {}) {
  const analytics = new RecordingAnalytics();
  const agentMessages: string[] = [];
  const application = createApplication(testConfig(overrides), silentLogger, {
    clients: fakeClients(),
    analytics,
    clock: OPEN_HOURS_CLOCK,
    onAgentMessage: (entry) => agentMessages.push(entry.text),
  });
  return { ...application, analytics, agentMessages };
}

const consumer = `Bearer ${signToken()}`;
const otherUser = `Bearer ${signToken({ sub: 'user-2' })}`;
const agent = `Bearer ${signToken({ sub: 'agent-1', roles: ['SUPPORT_AGENT'] })}`;

async function startConversation(app: ReturnType<typeof build>['app'], auth = consumer): Promise<string> {
  const res = await request(app).post('/api/v1/conversations').set('Authorization', auth).send({ channel: 'WEB_WIDGET' }).expect(201);
  return res.body.conversation.id as string;
}

describe('chatbot REST API', () => {
  it('serves liveness and readiness without authentication', async () => {
    const { app } = build();
    await request(app).get('/api/v1/health/live').expect(200, { status: 'UP' });
    const ready = await request(app).get('/api/v1/health/ready').expect(200);
    expect(ready.body.checks).toEqual([{ name: 'conversation-store', up: true }]);
  });

  it('rejects missing and forged tokens with RFC 7807 problem details and a correlation id', async () => {
    const { app } = build();
    const missing = await request(app).get('/api/v1/conversations').expect(401);
    expect(missing.headers['content-type']).toContain('application/problem+json');
    const problem = JSON.parse(missing.text);
    expect(problem).toMatchObject({ type: 'https://errors.uniti.example/chatbot/unauthorized', status: 401, instance: '/api/v1/conversations' });
    expect(problem.correlationId).toBe(missing.headers['x-correlation-id']);

    const forged = jwt.sign({ sub: 'user-1', account_id: 'ACC-12345678', roles: ['SUPPORT_AGENT'] }, 'attacker-secret', {
      algorithm: 'HS256',
      issuer: 'https://issuer.test',
      audience: 'uniti-chatbot',
    });
    await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${forged}`).expect(401);
    await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${signToken({ roles: ['ADMIN'] })}`).expect(401);
  });

  it('propagates a well-formed inbound correlation id and replaces an unsafe one', async () => {
    const { app } = build();
    const kept = await request(app).get('/api/v1/health/live').set('X-Correlation-Id', 'portal-req-0001');
    expect(kept.headers['x-correlation-id']).toBe('portal-req-0001');
    const replaced = await request(app).get('/api/v1/health/live').set('X-Correlation-Id', 'bad id <script>');
    expect(replaced.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('runs a full conversation and returns a paginated, redacted transcript', async () => {
    const { app, analytics } = build();
    const start = await request(app).post('/api/v1/conversations').set('Authorization', consumer).send({}).expect(201);
    const id = start.body.conversation.id;
    expect(start.headers.location).toBe(`/api/v1/conversations/${id}`);
    expect(start.body.replies[0].text).toContain('Hi, Jane!');

    const reply = await request(app)
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Authorization', consumer)
      .send({ text: 'is there an outage at SW1A 1AA? email me on jane@example.com' })
      .expect(200);
    expect(reply.body).toMatchObject({ intent: 'CHECK_OUTAGE', conversation: { activeFlow: 'check_outage', awaiting: 'faultOffer' } });
    expect(reply.body.conversation.slots).toBeUndefined();

    const transcript = await request(app).get(`/api/v1/conversations/${id}/transcript?page=1&pageSize=2`).set('Authorization', consumer).expect(200);
    expect(transcript.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
    expect(transcript.body.items[1]).toMatchObject({
      author: 'USER',
      text: 'is there an outage at [UK_POSTCODE]? email me on [EMAIL]',
      intent: 'CHECK_OUTAGE',
    });
    expect(analytics.names()).toEqual(['conversation_started', 'intent_classified', 'flow_started']);
  });

  it('validates message bodies and pagination at the boundary', async () => {
    const { app } = build();
    const id = await startConversation(app);
    const empty = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: '   ' }).expect(400);
    expect(JSON.parse(empty.text).errors).toEqual([{ field: 'text', message: 'must not be empty' }]);

    await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'x'.repeat(1001) }).expect(400);
    await request(app).post(`/api/v1/conversations/not-a-uuid/messages`).set('Authorization', consumer).send({ text: 'hi' }).expect(400);
    await request(app).post('/api/v1/conversations').set('Authorization', consumer).send({ channel: 'SMS' }).expect(400);

    const paging = await request(app).get(`/api/v1/conversations/${id}/transcript?pageSize=500`).set('Authorization', consumer).expect(400);
    expect(JSON.parse(paging.text).errors[0].field).toBe('pageSize');
  });

  it('answers malformed JSON with a 400 problem instead of a 500', async () => {
    const { app } = build();
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', consumer)
      .set('Content-Type', 'application/json')
      .send('{"channel":')
      .expect(400);
    expect(JSON.parse(res.text).type).toMatch(/malformed-json$/);
  });

  it("hides other users' conversations behind a 404 but lets support agents read them", async () => {
    const { app } = build();
    const id = await startConversation(app);
    await request(app).get(`/api/v1/conversations/${id}`).set('Authorization', otherUser).expect(404);
    await request(app).get(`/api/v1/conversations/${id}`).set('Authorization', agent).expect(200);
  });

  it('rate limits messages per user with standard headers and Retry-After', async () => {
    const { app } = build({ rateLimit: { windowMs: 60_000, maxMessages: 2 } });
    const id = await startConversation(app);
    const ok = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(200);
    expect(ok.headers['ratelimit-remaining']).toBe('0');

    const limited = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(JSON.parse(limited.text)).toMatchObject({ status: 429, type: expect.stringMatching(/rate-limited$/) });

    // A different user has an independent budget.
    await request(app).post('/api/v1/conversations').set('Authorization', otherUser).send({}).expect(201);
  });

  it('only lets support agents post into handed-off conversations', async () => {
    const { app, agentMessages } = build();
    const id = await startConversation(app);
    await request(app).post(`/api/v1/conversations/${id}/agent-messages`).set('Authorization', consumer).send({ text: 'hi' }).expect(403);
    await request(app).post(`/api/v1/conversations/${id}/agent-messages`).set('Authorization', agent).send({ text: 'hi' }).expect(409);

    const send = (text: string) => request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text });
    await send('talk to an agent').expect(200);
    const handed = await send('Need help moving my service to a new house').expect(200);
    expect(handed.body.conversation).toMatchObject({ status: 'HANDED_OFF', handoff: { queue: 'consumer-support', ticketId: 'TKT-0000001' } });

    const posted = await request(app)
      .post(`/api/v1/conversations/${id}/agent-messages`)
      .set('Authorization', agent)
      .send({ text: 'Hi Jane, I can help - is your new address SW1A 2AA?' })
      .expect(201);
    expect(posted.body.text).toBe('Hi Jane, I can help - is your new address [UK_POSTCODE]?');
    expect(agentMessages).toEqual([posted.body.text]);
  });

  it('refuses messages after the conversation has ended', async () => {
    const { app } = build();
    const id = await startConversation(app);
    const ended = await request(app).delete(`/api/v1/conversations/${id}`).set('Authorization', consumer).expect(200);
    expect(ended.body.status).toBe('ENDED');
    await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(409);
  });

  it('returns a problem document for unknown routes', async () => {
    const { app } = build();
    const res = await request(app).get('/nope').expect(404);
    expect(JSON.parse(res.text)).toMatchObject({ title: 'Route not found', detail: 'GET /nope does not exist' });
  });
});
```

## apps/chatbot/src/http/routes.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/http/routes.ts`.

```typescript
import { Router } from 'express';
import { AuthConfig } from '../config';
import { ConversationService } from '../conversation/conversationService';
import { ValidationError } from '../domain/errors';
import { Channel, TranscriptEntry } from '../domain/types';
import { RateLimiter } from '../ratelimit/rateLimiter';
import { asyncHandler, authenticate, ChatRequest, rateLimit, requireRole } from './middleware';

/**
 * REST API (versioned under /api/v1):
 *   POST   /conversations                       start a conversation
 *   GET    /conversations                       list the caller's active conversations
 *   GET    /conversations/:id                   conversation status
 *   POST   /conversations/:id/messages          send a user message, returns bot replies
 *   GET    /conversations/:id/transcript        paginated redacted transcript
 *   DELETE /conversations/:id                   end the conversation
 *   POST   /conversations/:id/agent-messages    live agent reply (SUPPORT_AGENT)
 */

const MAX_PAGE_SIZE = 100;

export function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const errors: Array<{ field: string; message: string }> = [];
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', message: 'must be an integer >= 1' });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    errors.push({ field: 'pageSize', message: `must be an integer between 1 and ${MAX_PAGE_SIZE}` });
  }
  if (errors.length > 0) throw new ValidationError(errors);
  return { page, pageSize };
}

function parseChannel(body: unknown): Channel {
  const channel = (body as { channel?: unknown } | undefined)?.channel;
  if (channel === undefined) return 'REST';
  if (channel === 'REST' || channel === 'WEB_WIDGET') return channel;
  throw new ValidationError([{ field: 'channel', message: 'must be REST or WEB_WIDGET' }]);
}

function idParam(req: ChatRequest): string {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError([{ field: 'id', message: 'must be a UUID' }]);
  return id;
}

export function conversationRoutes(
  service: ConversationService,
  auth: AuthConfig,
  limiter: RateLimiter,
  onAgentMessage: (entry: TranscriptEntry) => void = () => undefined,
): Router {
  const router = Router();
  router.use(authenticate(auth));

  router.post(
    '/conversations',
    rateLimit(limiter),
    asyncHandler(async (req, res) => {
      const result = await service.start(req.principal!, parseChannel(req.body));
      res.status(201).location(`/api/v1/conversations/${result.conversation.id}`).json(result);
    }),
  );

  router.get(
    '/conversations',
    asyncHandler(async (req, res) => {
      const items = await service.listForUser(req.principal!);
      res.json({ items, page: 1, pageSize: items.length, total: items.length });
    }),
  );

  router.get(
    '/conversations/:id',
    asyncHandler(async (req, res) => {
      res.json(await service.get(idParam(req), req.principal!));
    }),
  );

  router.post(
    '/conversations/:id/messages',
    rateLimit(limiter),
    asyncHandler(async (req, res) => {
      const text = (req.body as { text?: unknown } | undefined)?.text;
      const result = await service.handleMessage(idParam(req), req.principal!, text as string, {
        correlationId: req.correlationId,
        bearerToken: req.bearerToken,
      });
      res.json(result);
    }),
  );

  router.get(
    '/conversations/:id/transcript',
    asyncHandler(async (req, res) => {
      const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
      res.json(await service.transcript(idParam(req), req.principal!, page, pageSize));
    }),
  );

  router.delete(
    '/conversations/:id',
    asyncHandler(async (req, res) => {
      res.json(await service.end(idParam(req), req.principal!));
    }),
  );

  router.post(
    '/conversations/:id/agent-messages',
    requireRole('SUPPORT_AGENT'),
    asyncHandler(async (req, res) => {
      const text = (req.body as { text?: unknown } | undefined)?.text;
      const entry = await service.agentMessage(idParam(req), req.principal!, text as string);
      onAgentMessage(entry);
      res.status(201).json(entry);
    }),
  );

  return router;
}

export interface HealthCheck {
  name: string;
  check(): Promise<boolean>;
}

export function healthRoutes(checks: HealthCheck[]): Router {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'UP' });
  });
  router.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      const results = await Promise.all(
        checks.map(async (c) => ({ name: c.name, up: await c.check().catch(() => false) })),
      );
      const up = results.every((r) => r.up);
      res.status(up ? 200 : 503).json({ status: up ? 'UP' : 'DOWN', checks: results });
    }),
  );
  return router;
}
```

## apps/chatbot/src/logger.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/logger.ts`.

```typescript
/**
 * Structured JSON logger with correlation-id support.
 * Every line is a single JSON object so it can be shipped to Kibana/Dynatrace as-is.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogSink {
  write(line: string): void;
}

const stdoutSink: LogSink = {
  write: (line) => process.stdout.write(`${line}\n`),
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function serialiseError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: LogSink = stdoutSink,
): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const emit = (lvl: LogLevel, message: string, fields: Record<string, unknown> = {}): void => {
    if (LEVEL_WEIGHT[lvl] < threshold) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: lvl,
      service: 'chatbot',
      message,
      ...bindings,
    };
    for (const [key, value] of Object.entries(fields)) {
      entry[key] = serialiseError(value);
    }
    sink.write(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

/** A logger that discards everything; used by unit tests. */
export const silentLogger: Logger = createLogger('error', {}, { write: () => undefined });
```

## apps/chatbot/src/nlu/entityExtractor.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/entityExtractor.test.ts`.

```typescript
import { extractEntities, firstEntity, normaliseDate, normalisePostcode, normaliseSpeed } from './entityExtractor';

describe('entityExtractor', () => {
  it('extracts and normalises domain identifiers', () => {
    const entities = extractEntities('my account is acc12345678 and invoice INV-00123456');
    expect(firstEntity(entities, 'ACCOUNT_ID')).toBe('ACC-12345678');
    expect(firstEntity(entities, 'INVOICE_ID')).toBe('INV-00123456');
  });

  it('normalises speeds to Mbps', () => {
    expect(normaliseSpeed('1 Gbps')).toBe('1000');
    expect(normaliseSpeed('2gig')).toBe('2000');
    expect(normaliseSpeed('500 Mb')).toBe('500');
    expect(firstEntity(extractEntities('upgrade me to 2 gig please'), 'SPEED')).toBe('2000');
  });

  it('normalises postcodes to canonical spacing', () => {
    expect(normalisePostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(firstEntity(extractEntities('outage at m1 1ae?'), 'POSTCODE')).toBe('M1 1AE');
  });

  it('normalises several date formats', () => {
    const ref = new Date('2026-05-01T00:00:00Z');
    expect(normaliseDate('2026-03-12', ref)).toBe('2026-03-12');
    expect(normaliseDate('12/03/26', ref)).toBe('2026-03-12');
    expect(normaliseDate('3rd June', ref)).toBe('2026-06-03');
  });

  it('normalises UK phone numbers with international prefix', () => {
    expect(firstEntity(extractEntities('call +44 7700 900123'), 'PHONE')).toBe('07700900123');
  });

  it('returns entities ordered by position without overlaps', () => {
    const entities = extractEntities('TKT-1234567 at SW1A 1AA');
    expect(entities.map((e) => e.type)).toEqual(['TICKET_ID', 'POSTCODE']);
  });
});
```

## apps/chatbot/src/nlu/entityExtractor.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/entityExtractor.ts`.

```typescript
import { Entity, EntityType } from '../domain/types';

/**
 * Deterministic entity extraction for domain identifiers and common slot values.
 * Runs on the raw utterance (in memory only) so slot filling can use real values;
 * the persisted transcript is redacted separately.
 */

interface EntityPattern {
  type: EntityType;
  pattern: RegExp;
  normalise?: (raw: string) => string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function normaliseSpeed(raw: string): string {
  const match = /(\d+(?:\.\d+)?)\s*(g|gb|gig|gbps|m|mb|meg|mbps)/i.exec(raw.replace(/\s+/g, ''));
  if (!match) return raw;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const mbps = unit.startsWith('g') ? Math.round(value * 1000) : Math.round(value);
  return String(mbps);
}

export function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+44') ? `0${digits.slice(3)}` : digits;
}

/**
 * Normalises dates like "12 March", "12/03/2026", "2026-03-12" to ISO yyyy-mm-dd.
 * Year defaults to the reference date's year.
 */
export function normaliseDate(raw: string, reference: Date = new Date()): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const numeric = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(raw);
  if (numeric) {
    const year = numeric[3] ? (numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3])) : reference.getUTCFullYear();
    return toIso(year, Number(numeric[2]), Number(numeric[1]));
  }
  const named = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)/i.exec(raw);
  if (named) {
    const monthIndex = MONTHS.findIndex((m) => m.startsWith(named[2].toLowerCase().slice(0, 3)));
    if (monthIndex >= 0) return toIso(reference.getUTCFullYear(), monthIndex + 1, Number(named[1]));
  }
  return raw;
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const PATTERNS: EntityPattern[] = [
  { type: 'ACCOUNT_ID', pattern: /\bACC-?\d{8}\b/gi, normalise: (r) => `ACC-${r.replace(/\D/g, '')}` },
  { type: 'INVOICE_ID', pattern: /\bINV-?\d{6,10}\b/gi, normalise: (r) => `INV-${r.replace(/\D/g, '')}` },
  { type: 'TICKET_ID', pattern: /\bTKT-?\d{6,10}\b/gi, normalise: (r) => `TKT-${r.replace(/\D/g, '')}` },
  { type: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, normalise: (r) => r.toLowerCase() },
  { type: 'PHONE', pattern: /(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g, normalise: normalisePhone },
  { type: 'POSTCODE', pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, normalise: normalisePostcode },
  { type: 'SPEED', pattern: /\b\d+(?:\.\d+)?\s?(?:gbps|gig|gb|g|mbps|meg|mb)\b/gi, normalise: normaliseSpeed },
  {
    type: 'DATE',
    pattern: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi,
    normalise: (r) => normaliseDate(r),
  },
];

export function extractEntities(text: string): Entity[] {
  const entities: Entity[] = [];
  for (const { type, pattern, normalise } of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = entities.some((e) => start < e.end && end > e.start);
      if (overlaps) continue;
      entities.push({ type, value: normalise ? normalise(match[0]) : match[0], start, end });
    }
  }
  return entities.sort((a, b) => a.start - b.start);
}

export function firstEntity(entities: Entity[], type: EntityType): string | undefined {
  return entities.find((e) => e.type === type)?.value;
}
```

## apps/chatbot/src/nlu/intentClassifier.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/intentClassifier.test.ts`.

````typescript
import { silentLogger } from '../logger';
import { CompositeIntentClassifier, quickReplyPayload } from './intentClassifier';
import { LlmClassifyRequest, LlmIntentProvider, NullLlmProvider, parseLlmResponse } from './llmProvider';
import { RulesMatcher } from './rulesMatcher';

class StubLlm implements LlmIntentProvider {
  readonly name = 'stub';
  readonly requests: LlmClassifyRequest[] = [];
  constructor(private readonly reply?: { intent: never | string; confidence: number }) {}
  async classify(request: LlmClassifyRequest) {
    this.requests.push(request);
    return this.reply as never;
  }
}

function classifier(llm: LlmIntentProvider = new NullLlmProvider()) {
  return new CompositeIntentClassifier({ rules: new RulesMatcher(), llm, minConfidence: 0.55, logger: silentLogger });
}

describe('RulesMatcher', () => {
  const matcher = new RulesMatcher();

  it('scores strong phrases highly', () => {
    const best = matcher.best('My internet is down again!');
    expect(best?.intent).toBe('CHECK_OUTAGE');
    expect(best!.score).toBeGreaterThan(0.85);
  });

  it('applies negative cues', () => {
    const scores = matcher.score('I want to downgrade my plan');
    expect(scores.find((s) => s.intent === 'PLAN_UPGRADE')).toBeUndefined();
  });

  it('only matches short-form intents on short utterances', () => {
    expect(matcher.best('yes')?.intent).toBe('AFFIRM');
    const long = matcher.score('yes I would like to know why my bill went up this month');
    expect(long.find((s) => s.intent === 'AFFIRM')).toBeUndefined();
    expect(long[0].intent).toBe('BILL_ENQUIRY');
  });
});

describe('CompositeIntentClassifier', () => {
  it('short-circuits on quick reply payloads', async () => {
    const result = await classifier().classify(quickReplyPayload('RESET_ROUTER'));
    expect(result).toMatchObject({ intent: 'RESET_ROUTER', confidence: 1, source: 'context' });
  });

  it('does not call the LLM when rules are confident', async () => {
    const llm = new StubLlm({ intent: 'BILL_ENQUIRY', confidence: 0.99 });
    const result = await classifier(llm).classify('Please reset my router, the router lights are red');
    expect(result.intent).toBe('RESET_ROUTER');
    expect(llm.requests).toHaveLength(0);
  });

  it('uses the LLM when rules are weak and sends redacted text', async () => {
    const llm = new StubLlm({ intent: 'PLAN_UPGRADE', confidence: 0.8 });
    const result = await classifier(llm).classify('could I get something quicker? email me at a@b.com');
    expect(result).toMatchObject({ intent: 'PLAN_UPGRADE', source: 'llm' });
    expect(llm.requests[0].redactedText).toContain('[EMAIL]');
    expect(llm.requests[0].redactedText).not.toContain('a@b.com');
  });

  it('falls back when nothing is confident', async () => {
    const result = await classifier().classify('the weather is lovely');
    expect(result.intent).toBe('FALLBACK');
  });

  it('carries extracted entities on the prediction', async () => {
    const result = await classifier().classify('is there an outage at SW1A 1AA');
    expect(result.intent).toBe('CHECK_OUTAGE');
    expect(result.entities[0]).toMatchObject({ type: 'POSTCODE', value: 'SW1A 1AA' });
  });
});

describe('parseLlmResponse', () => {
  const allowed = ['BILL_ENQUIRY', 'CHECK_OUTAGE'] as const;

  it('parses fenced JSON content and clamps confidence', () => {
    const payload = { choices: [{ message: { content: '```json\n{"intent":"bill_enquiry","confidence":1.7}\n```' } }] };
    expect(parseLlmResponse(payload, [...allowed])).toEqual({ intent: 'BILL_ENQUIRY', confidence: 1 });
  });

  it('rejects intents outside the candidate list', () => {
    const payload = { choices: [{ message: { content: '{"intent":"DELETE_ACCOUNT","confidence":0.9}' } }] };
    expect(parseLlmResponse(payload, [...allowed])).toBeUndefined();
  });

  it('rejects malformed payloads', () => {
    expect(parseLlmResponse({}, [...allowed])).toBeUndefined();
    expect(parseLlmResponse({ choices: [{ message: { content: 'not json' } }] }, [...allowed])).toBeUndefined();
  });
});
````

## apps/chatbot/src/nlu/intentClassifier.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/nlu/intentClassifier.ts`.

```typescript
import { Entity, IntentName, IntentPrediction } from '../domain/types';
import { Logger } from '../logger';
import { redactText } from '../privacy/piiRedactor';
import { extractEntities } from './entityExtractor';
import { LlmIntentProvider } from './llmProvider';
import { RulesMatcher } from './rulesMatcher';

/**
 * Composite intent classifier.
 *
 * Strategy:
 *  1. Quick-reply payloads (e.g. "intent:RESET_ROUTER") short-circuit with confidence 1.
 *  2. The rules matcher runs first; a confident rules hit is accepted directly.
 *  3. Otherwise the LLM provider (if any) is consulted with redacted text.
 *  4. The higher-confidence prediction wins; below `minConfidence` it is FALLBACK.
 */

export interface IntentClassifier {
  classify(text: string, context?: ClassificationContext): Promise<IntentPrediction>;
}

export interface ClassificationContext {
  history?: string[];
  correlationId?: string;
}

export interface CompositeClassifierOptions {
  rules: RulesMatcher;
  llm: LlmIntentProvider;
  minConfidence: number;
  /** Rules score at or above this skips the LLM call entirely. */
  rulesShortCircuit?: number;
  logger: Logger;
}

export const ROUTABLE_INTENTS: IntentName[] = [
  'CHECK_OUTAGE',
  'BILL_ENQUIRY',
  'RESET_ROUTER',
  'PLAN_UPGRADE',
  'RAISE_TICKET',
  'TALK_TO_AGENT',
  'GREETING',
  'GOODBYE',
  'AFFIRM',
  'DENY',
  'CANCEL',
];

const PAYLOAD_PREFIX = 'intent:';

export class CompositeIntentClassifier implements IntentClassifier {
  private readonly shortCircuit: number;

  constructor(private readonly options: CompositeClassifierOptions) {
    this.shortCircuit = options.rulesShortCircuit ?? 0.85;
  }

  async classify(text: string, context: ClassificationContext = {}): Promise<IntentPrediction> {
    const entities = extractEntities(text);
    const fromPayload = this.fromPayload(text, entities);
    if (fromPayload) return fromPayload;

    const rulesBest = this.options.rules.best(text);
    if (rulesBest && rulesBest.score >= this.shortCircuit) {
      return { intent: rulesBest.intent, confidence: rulesBest.score, source: 'rules', entities };
    }

    const llmResult = await this.options.llm.classify({
      redactedText: redactText(text),
      candidateIntents: ROUTABLE_INTENTS,
      history: (context.history ?? []).map(redactText),
      correlationId: context.correlationId,
    });

    const candidates: IntentPrediction[] = [];
    if (rulesBest) candidates.push({ intent: rulesBest.intent, confidence: rulesBest.score, source: 'rules', entities });
    if (llmResult) candidates.push({ intent: llmResult.intent, confidence: llmResult.confidence, source: 'llm', entities });

    const winner = candidates.sort((a, b) => b.confidence - a.confidence)[0];
    if (!winner || winner.confidence < this.options.minConfidence || winner.intent === 'FALLBACK') {
      this.options.logger.debug('intent below threshold', {
        best: winner?.intent,
        confidence: winner?.confidence,
        correlationId: context.correlationId,
      });
      return { intent: 'FALLBACK', confidence: winner?.confidence ?? 0, source: winner?.source ?? 'rules', entities };
    }
    return winner;
  }

  private fromPayload(text: string, entities: Entity[]): IntentPrediction | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith(PAYLOAD_PREFIX)) return undefined;
    const candidate = trimmed.slice(PAYLOAD_PREFIX.length).toUpperCase() as IntentName;
    if (!ROUTABLE_INTENTS.includes(candidate)) return undefined;
    return { intent: candidate, confidence: 1, source: 'context', entities };
  }
}

export function quickReplyPayload(intent: IntentName): string {
  return `${PAYLOAD_PREFIX}${intent}`;
}
```
