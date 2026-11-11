import { ChatHarness, outcomeOf, principal } from '../../testing/chatHarness';
import { buildSubject, derivePriority } from './raiseTicket';

describe('derivePriority', () => {
  const consumer = principal();
  const business = principal({ roles: ['BUSINESS_ADMIN'] });

  it('never assigns P1, which is reserved for NOC major incidents', () => {
    expect(derivePriority('FAULT', 'All sites down, phones down, total outage', business)).toBe('P2');
  });

  it('ranks a total loss of service higher for business customers', () => {
    expect(derivePriority('FAULT', 'We have no internet at the office', business)).toBe('P2');
    expect(derivePriority('FAULT', 'We have no internet at home', consumer)).toBe('P3');
  });

  it('treats degraded service as P3 and other faults as P4', () => {
    expect(derivePriority('FAULT', 'Connection keeps disconnecting every evening', business)).toBe('P3');
    expect(derivePriority('FAULT', 'The router LED is a strange colour', consumer)).toBe('P4');
  });

  it('assigns category defaults for non-fault tickets', () => {
    expect(derivePriority('COMPLAINT', 'Unhappy with the installer', consumer)).toBe('P3');
    expect(derivePriority('BILLING', 'Charged twice', consumer)).toBe('P3');
    expect(derivePriority('GENERAL', 'Can I change my email address?', consumer)).toBe('P4');
  });
});

describe('buildSubject', () => {
  it('uses the category label and the first sentence of the description', () => {
    expect(buildSubject('BILLING', 'I was charged twice. Please refund me.')).toBe('Billing or payments: I was charged twice');
  });

  it('truncates long first sentences to keep subjects scannable', () => {
    const subject = buildSubject('GENERAL', 'x'.repeat(100));
    expect(subject).toBe(`Something else: ${'x'.repeat(57)}...`);
  });
});

describe('raise ticket flow', () => {
  it('collects category, description and callback number, then creates the ticket after confirmation', async () => {
    const chat = new ChatHarness();
    const menu = await chat.say('I want to raise a ticket');
    expect(menu.replies[0].quickReplies?.map((q) => q.payload)).toEqual(['FAULT', 'BILLING', 'COMPLAINT', 'GENERAL']);

    await chat.say('1');
    expect(chat.awaiting).toBe('description');

    await chat.say('The internet has been completely down since this morning, nothing works');
    expect(chat.awaiting).toBe('phone');

    const summary = await chat.say('07700 900123');
    expect(summary.text).toContain('- Type: Fault with my service');
    expect(summary.text).toContain('- Callback: 07700900123');
    expect(summary.text).toContain('Expected response: within 1 working day');

    const created = await chat.say('yes');
    expect(created.text).toContain('Your ticket TKT-0000001 is open (priority P3)');
    expect(created.replies[0].card).toEqual({ kind: 'TICKET', ticketId: 'TKT-0000001', priority: 'P3', status: 'OPEN' });
    expect(chat.clients.tickets.created[0].request).toMatchObject({
      category: 'FAULT',
      priority: 'P3',
      subject: 'Fault with my service: The internet has been completely down since this morning,...',
      contactPhone: '07700900123',
      conversationId: chat.conversation.id,
    });
    expect(outcomeOf(created, 'raise_ticket')).toBe('ticket_created');
  });

  it('accepts a category by alias', async () => {
    const chat = new ChatHarness();
    await chat.say('log a fault');
    await chat.say('billing');
    await chat.say('My direct debit was taken twice in October');
    await chat.say('07700900123');
    await chat.say('yes');
    expect(chat.clients.tickets.created[0].request.category).toBe('BILLING');
  });

  it('does not let a typed description be hijacked by intent detection', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('Please reset my router, the router lights are red all the time');
    expect(chat.activeFlowId).toBe('raise_ticket');
    expect(chat.conversation.activeFlow?.slots.description).toContain('reset my router');
  });

  it('abandons the flow after three unusable descriptions', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    const first = await chat.say('slow');
    expect(first.text).toContain('at least 15 characters');
    await chat.say('very slow');
    const last = await chat.say('help');
    expect(last.text).toContain("Let's leave this here for now");
    expect(outcomeOf(last, 'raise_ticket')).toBe('abandoned');
    expect(chat.conversation.fallbackCount).toBe(1);
  });

  it('creates nothing when the customer cancels at the summary', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('4');
    await chat.say('How do I add a second user to the portal?');
    await chat.say('07700900123');
    const cancelled = await chat.say('no');
    expect(cancelled.text).toContain("I haven't raised anything");
    expect(chat.clients.tickets.created).toHaveLength(0);
  });

  it('ends gracefully without a ticket when the ticket API is unavailable', async () => {
    const chat = new ChatHarness();
    chat.clients.tickets.failNext = true;
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('My broadband drops out every hour or so');
    await chat.say('07700900123');
    const failed = await chat.say('yes');
    expect(failed.text).toContain("couldn't create your ticket");
    expect(chat.clients.tickets.created).toHaveLength(0);
  });
});
