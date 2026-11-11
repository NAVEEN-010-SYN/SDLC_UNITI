import { silentLogger } from '../logger';
import { Conversation } from '../domain/types';
import { PlatformClients } from '../clients/platformClients';
import { postcodeSlot, yesNoSlot } from './slots';
import {
  END,
  FlowContext,
  FlowDefinition,
  FlowDefinitionError,
  interpretYesNo,
  prefillFromEntities,
  startFlow,
  stepFlow,
  validateFlow,
} from './stateMachine';
import { extractEntities } from '../nlu/entityExtractor';

const conversation: Conversation = {
  id: 'c1',
  principal: { userId: 'u1', accountId: 'ACC-00000001', roles: ['CONSUMER'] },
  channel: 'REST',
  status: 'ACTIVE',
  suspendedFlows: [],
  fallbackCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function ctx(): FlowContext {
  return {
    conversation,
    principal: conversation.principal,
    slots: {},
    clients: {} as PlatformClients,
    request: { correlationId: 'corr' },
    logger: silentLogger,
    idempotencyKey: (p) => `c1:${p}`,
    scratch: {},
  };
}

const lookups: string[] = [];

const flow: FlowDefinition = {
  id: 'test',
  intent: 'CHECK_OUTAGE',
  label: 'test',
  initial: 'postcode',
  states: {
    postcode: { kind: 'slot', slot: 'postcode', validator: postcodeSlot, prompt: { text: 'Postcode?' }, next: 'lookup', maxRetries: 2 },
    lookup: {
      kind: 'action',
      run: async (c) => {
        lookups.push(String(c.slots.postcode));
        return { replies: [{ text: `Checked ${c.slots.postcode}` }], next: 'confirm' };
      },
    },
    confirm: { kind: 'confirm', prompt: { text: 'Anything else?' }, onYes: 'done', onNo: END },
    done: { kind: 'action', run: async () => ({ replies: [{ text: 'Great' }], next: END, outcome: 'resolved' }) },
  },
};

describe('stateMachine', () => {
  beforeEach(() => lookups.splice(0));

  it('validates transitions statically', () => {
    expect(() => validateFlow(flow)).not.toThrow();
    const broken: FlowDefinition = { ...flow, states: { ...flow.states, confirm: { kind: 'confirm', prompt: { text: '?' }, onYes: 'nowhere', onNo: END } } };
    expect(() => validateFlow(broken)).toThrow(FlowDefinitionError);
  });

  it('prompts for a missing slot, then runs actions after valid input', async () => {
    const first = await stepFlow(flow, startFlow(flow), ctx());
    expect(first.replies.map((r) => r.text)).toEqual(['Postcode?']);
    expect(first.flow?.state).toBe('postcode');

    const second = await stepFlow(flow, first.flow!, ctx(), { text: 'm1 1ae', entities: [] });
    expect(second.replies.map((r) => r.text)).toEqual(['Checked M1 1AE', 'Anything else?']);
    expect(second.flow?.state).toBe('confirm');

    const third = await stepFlow(flow, second.flow!, ctx(), { text: 'yes', entities: [] });
    expect(third.flow).toBeUndefined();
    expect(third.outcome).toBe('resolved');
  });

  it('re-asks on invalid input and abandons after max retries', async () => {
    const start = startFlow(flow);
    const bad1 = await stepFlow(flow, start, ctx(), { text: 'nowhere', entities: [] });
    expect(bad1.replies[0].text).toMatch(/valid UK postcode/);
    expect(bad1.flow?.retries).toBe(1);
    const bad2 = await stepFlow(flow, bad1.flow!, ctx(), { text: 'still nowhere', entities: [] });
    expect(bad2.abandoned).toBe(true);
    expect(bad2.flow).toBeUndefined();
  });

  it('skips slots that were pre-filled from entities', async () => {
    const prefill = prefillFromEntities(flow, extractEntities('outage at SW1A 1AA'));
    expect(prefill).toEqual({ postcode: 'SW1A 1AA' });
    const result = await stepFlow(flow, startFlow(flow, prefill), ctx());
    expect(lookups).toEqual(['SW1A 1AA']);
    expect(result.flow?.state).toBe('confirm');
  });

  it('ends the flow on a negative confirmation', async () => {
    const atConfirm = { ...startFlow(flow, { postcode: 'SW1A 1AA' }), state: 'confirm' };
    const result = await stepFlow(flow, atConfirm, ctx(), { text: 'no thanks', entities: [] });
    expect(result.flow).toBeUndefined();
    expect(result.replies).toEqual([]);
  });

  it('detects runaway cycles', async () => {
    const cyclic: FlowDefinition = {
      id: 'loop',
      intent: 'GREETING',
      label: 'loop',
      initial: 'a',
      states: { a: { kind: 'action', run: async () => ({ next: 'a' }) } },
    };
    await expect(stepFlow(cyclic, startFlow(cyclic), ctx())).rejects.toThrow(/exceeded/);
  });

  it('interprets yes/no variants including quick reply payloads', () => {
    expect(interpretYesNo('Yes.')).toBe(true);
    expect(interpretYesNo('intent:AFFIRM')).toBe(true);
    expect(interpretYesNo('nope')).toBe(false);
    expect(interpretYesNo('maybe')).toBeUndefined();
    expect(yesNoSlot.parse('no', [])).toEqual({ ok: true, value: false });
  });
});
