import { ChatHarness } from '../testing/chatHarness';
import { MAX_FALLBACKS_BEFORE_AGENT } from './dialogEngine';

describe('DialogEngine routing', () => {
  it('greets by first name and offers the main menu', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('hello');
    expect(turn.text).toBe("Hi, Jane! I'm the Uniti assistant. What can I help you with today?");
    expect(turn.replies[0].quickReplies).toHaveLength(6);
  });

  it('suspends a flow for a confident interrupting intent and resumes it afterwards', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('Broadband drops every evening around 8pm');
    expect(chat.awaiting).toBe('phone');

    const interrupted = await chat.say('is there an outage at SW1A 1AA');
    expect(interrupted.events.map((e) => e.type)).toEqual(['flow_suspended', 'flow_started']);
    expect(chat.activeFlowId).toBe('check_outage');
    expect(chat.conversation.suspendedFlows.map((f) => f.flowId)).toEqual(['raise_ticket']);

    const resumed = await chat.say('no');
    expect(resumed.text).toContain('Now, back to raising a ticket.');
    expect(resumed.text).toContain('What number can our team call you back on?');
    expect(chat.activeFlowId).toBe('raise_ticket');
    // Slots collected before the interruption survive the suspension.
    expect(chat.conversation.activeFlow?.slots.category).toBe('FAULT');
  });

  it('lets an explicit quick-reply choice interrupt a free-text slot', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    expect(chat.awaiting).toBe('description');

    await chat.say('intent:CHECK_OUTAGE');
    expect(chat.activeFlowId).toBe('check_outage');
    expect(chat.conversation.suspendedFlows[0]).toMatchObject({ flowId: 'raise_ticket', state: 'description' });
  });

  it('treats a weak intent during a slot as input for that slot', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    const turn = await chat.say('complaint');
    expect(turn.events).toHaveLength(0);
    expect(chat.conversation.activeFlow?.slots.category).toBe('COMPLAINT');
  });

  it('cancels the active flow and drops suspended ones', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('intent:PLAN_UPGRADE');
    expect(chat.conversation.suspendedFlows).toHaveLength(1);

    const cancelled = await chat.say('never mind');
    expect(cancelled.events).toEqual([{ type: 'flow_abandoned', flowId: 'plan_upgrade', outcome: 'cancelled' }]);
    expect(chat.activeFlowId).toBeUndefined();
    expect(chat.conversation.suspendedFlows).toEqual([]);
  });

  it(`offers a human after more than ${MAX_FALLBACKS_BEFORE_AGENT} consecutive fallbacks`, async () => {
    const chat = new ChatHarness();
    const first = await chat.say('the weather is lovely');
    expect(first.text).toContain("I didn't quite get that");
    await chat.say('purple elephants dancing');
    const third = await chat.say('what is the meaning of life');
    expect(third.text).toContain('Would you like to speak to someone from our team?');
    expect(third.replies[0].quickReplies?.[0].payload).toBe('intent:TALK_TO_AGENT');
    expect(chat.conversation.fallbackCount).toBe(3);
  });

  it('resets the fallback counter once a flow starts', async () => {
    const chat = new ChatHarness();
    await chat.say('the weather is lovely');
    await chat.say('purple elephants dancing');
    await chat.say('my bill');
    expect(chat.conversation.fallbackCount).toBe(0);
  });

  it('ends the conversation on goodbye', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('bye');
    expect(chat.conversation.status).toBe('ENDED');
    expect(turn.events).toEqual([{ type: 'conversation_ended', outcome: 'user_goodbye' }]);
  });

  it('remembers the last understood intent but not fallbacks', async () => {
    const chat = new ChatHarness();
    await chat.say('my bill');
    await chat.say('gibberish words here');
    expect(chat.conversation.lastIntent).toBe('BILL_ENQUIRY');
  });

  it('keeps at most three suspended flows, dropping the oldest', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('intent:PLAN_UPGRADE');
    await chat.say('intent:BILL_ENQUIRY');
    await chat.say('intent:CHECK_OUTAGE');
    await chat.say('intent:RESET_ROUTER');
    expect(chat.activeFlowId).toBe('reset_router');
    expect(chat.conversation.suspendedFlows.map((f) => f.flowId)).toEqual(['check_outage', 'bill_enquiry', 'plan_upgrade']);
  });
});
