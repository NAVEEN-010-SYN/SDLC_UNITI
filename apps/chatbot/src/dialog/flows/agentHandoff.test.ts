import { ChatHarness, outcomeOf, principal } from '../../testing/chatHarness';
import { CLOSED_HOURS_CLOCK } from '../../testing/fakes';
import { isQueueOpen, londonTime, queueFor } from './agentHandoff';

describe('queue routing and opening hours', () => {
  it('routes each audience to its own desk', () => {
    expect(queueFor(principal())).toBe('consumer-support');
    expect(queueFor(principal({ roles: ['BUSINESS_USER'] }))).toBe('business-support');
    expect(queueFor(principal({ roles: ['PARTNER_AGENT'] }))).toBe('partner-desk');
    expect(queueFor(principal({ roles: ['WHOLESALE_BUYER'] }))).toBe('partner-desk');
  });

  it('evaluates opening hours in Europe/London time, including summer time', () => {
    // 07:15 UTC on a Monday in July is 08:15 BST: open, although the UTC hour is before 8.
    expect(londonTime(new Date('2026-07-06T07:15:00Z'))).toEqual({ weekday: 1, hour: 8 });
    expect(isQueueOpen('consumer-support', new Date('2026-07-06T07:15:00Z'))).toBe(true);
    // 19:30 UTC is 20:30 BST: closed, although the UTC hour is before 20.
    expect(isQueueOpen('consumer-support', new Date('2026-07-06T19:30:00Z'))).toBe(false);
  });

  it('keeps the partner desk closed at weekends and unknown queues always closed', () => {
    expect(isQueueOpen('partner-desk', new Date('2026-11-07T11:00:00Z'))).toBe(false);
    expect(isQueueOpen('business-support', CLOSED_HOURS_CLOCK())).toBe(true);
    expect(isQueueOpen('no-such-queue', new Date('2026-11-09T11:00:00Z'))).toBe(false);
  });
});

describe('agent handoff flow', () => {
  it('captures a reason and hands off with a ticket carrying the context', async () => {
    const chat = new ChatHarness();
    const ask = await chat.say('can I speak to a human');
    expect(ask.text).toContain('what do you need help with?');

    const handed = await chat.say('My router keeps dropping out at night');
    expect(handed.text).toContain('connecting you to the next available agent');
    expect(chat.conversation.status).toBe('HANDED_OFF');
    expect(chat.conversation.handoff).toEqual({
      queue: 'consumer-support',
      reason: 'My router keeps dropping out at night',
      ticketId: 'TKT-0000001',
      requestedAt: '2026-11-09T10:00:00.000Z',
    });
    expect(chat.clients.tickets.created[0].request).toMatchObject({ category: 'HANDOFF', priority: 'P4' });
    expect(handed.events).toContainEqual({ type: 'handoff_requested', flowId: 'agent_handoff', outcome: 'consumer-support' });
  });

  it('offers a callback ticket instead when the consumer desk is closed', async () => {
    const chat = new ChatHarness({ clock: CLOSED_HOURS_CLOCK });
    await chat.say('talk to an agent');
    const closed = await chat.say('Question about my contract end date');
    expect(closed.text).toContain("Our team isn't available right now");
    expect(closed.replies[0].quickReplies?.[0].payload).toBe('intent:RAISE_TICKET');
    expect(chat.conversation.status).toBe('ACTIVE');
    expect(chat.clients.tickets.created).toHaveLength(0);
    expect(outcomeOf(closed, 'agent_handoff')).toBe('out_of_hours');
  });

  it('hands business customers to the 24/7 desk at a higher priority, even overnight', async () => {
    const chat = new ChatHarness({ clock: CLOSED_HOURS_CLOCK, principal: { roles: ['BUSINESS_ADMIN'] } });
    await chat.say('live agent please');
    await chat.say('Our office line is down');
    expect(chat.conversation.handoff?.queue).toBe('business-support');
    expect(chat.clients.tickets.created[0].request.priority).toBe('P3');
  });

  it('skips the reason question when the customer arrives from another flow', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...chat.clients.network.diagnostic, ontOnline: false };
    await chat.say('please reset my router');
    const handed = await chat.say('intent:TALK_TO_AGENT');
    expect(chat.conversation.handoff?.reason).toBe('Continuing from reset router');
    expect(handed.replies).toHaveLength(1);
  });
});
