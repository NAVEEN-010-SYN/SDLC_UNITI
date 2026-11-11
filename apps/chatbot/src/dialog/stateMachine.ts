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
