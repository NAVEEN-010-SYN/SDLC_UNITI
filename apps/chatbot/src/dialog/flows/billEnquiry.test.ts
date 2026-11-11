import { DownstreamError } from '../../domain/errors';
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { gbp, invoice } from '../../testing/fakes';
import { explainChange, formatLines, summariseInvoice } from './billEnquiry';

describe('bill enquiry flow', () => {
  it('explains the latest bill against the previous one, then shows the breakdown', async () => {
    const chat = new ChatHarness();
    const summary = await chat.say('why is my bill higher this month?');
    expect(summary.text).toContain('Your invoice INV-00000002');
    expect(summary.text).toContain('£49.99');
    expect(summary.text).toContain('£14.99 higher than your previous bill');
    expect(summary.replies[0].card).toMatchObject({ kind: 'INVOICE', invoiceId: 'INV-00000002', total: gbp(4999) });
    expect(chat.awaiting).toBe('breakdownOffer');

    // Scratch is per turn, so the breakdown must re-fetch the invoice by the resolved id.
    const getInvoice = jest.spyOn(chat.clients.billing, 'getInvoice');
    const breakdown = await chat.say('yes');
    expect(getInvoice).toHaveBeenCalledWith('ACC-12345678', 'INV-00000002', expect.anything());
    expect(breakdown.text).toContain('- Fibre 500 monthly: £35.00');
    expect(chat.awaiting).toBe('disputeOffer');

    const done = await chat.say('no');
    expect(outcomeOf(done, 'bill_enquiry')).toBe('resolved');
    expect(chat.clients.tickets.created).toHaveLength(0);
  });

  it('looks up a specific invoice named in the opening message', async () => {
    const chat = new ChatHarness();
    const turn = await chat.say('question about invoice INV-00000001');
    expect(turn.text).toContain('Your invoice INV-00000001');
    expect(turn.text).not.toContain('previous bill');
  });

  it('raises an idempotent P3 billing query when the customer disputes a charge', async () => {
    const chat = new ChatHarness();
    await chat.say('my bill');
    await chat.say('no');
    const query = await chat.say('yes');

    expect(query.text).toContain("I've raised billing query TKT-0000001");
    const [created] = chat.clients.tickets.created;
    expect(created.request).toMatchObject({ category: 'BILLING', priority: 'P3', subject: 'Billing query on INV-00000002' });
    expect(created.key).toMatch(/billing-query-INV-00000002$/);
    expect(outcomeOf(query, 'bill_enquiry')).toBe('ticket_created');
  });

  it('tells new customers they have no invoices yet', async () => {
    const chat = new ChatHarness();
    chat.clients.billing.invoices = [];
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("don't have any invoices yet");
    expect(outcomeOf(turn, 'bill_enquiry')).toBe('no_invoices');
  });

  it('degrades gracefully when billing is unavailable', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.billing, 'listInvoices').mockRejectedValue(new DownstreamError('billing-api', 500, 'boom'));
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("couldn't fetch your bill");
  });

  it('refuses business users without billing rights', async () => {
    const chat = new ChatHarness({ principal: { roles: ['BUSINESS_USER'] } });
    const turn = await chat.say('my bill');
    expect(turn.text).toContain("your account role can't do that");
    expect(chat.activeFlowId).toBeUndefined();
  });
});

describe('bill explanations', () => {
  const previous = invoice('INV-00000001', 3500);

  it('itemises one-off charges that explain an increase', () => {
    const current = invoice('INV-00000002', 6500, {
      lines: [
        { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
        { description: 'Engineer visit', amount: gbp(3000), category: 'ONE_OFF' },
      ],
    });
    const reply = summariseInvoice(current, previous);
    expect(reply.text).toContain('£30.00 higher');
    expect(reply.text).toContain('one-off charges: Engineer visit (£30.00)');
  });

  it('names new recurring add-ons when there are no one-off charges', () => {
    const current = invoice('INV-00000002', 4000, {
      lines: [
        { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
        { description: 'Static IP', amount: gbp(500), category: 'RECURRING' },
      ],
    });
    expect(explainChange(current, previous)).toMatchObject({ delta: 500, newRecurring: [expect.objectContaining({ description: 'Static IP' })] });
    expect(summariseInvoice(current, previous).text).toContain('New this month: Static IP');
  });

  it('reports a lower bill without inventing a reason', () => {
    const current = invoice('INV-00000002', 3000);
    expect(summariseInvoice(current, previous).text).toContain('£5.00 lower than your previous bill.');
  });

  it('does not compare invoices in different currencies', () => {
    const euro = invoice('INV-00000002', 3500, { total: { amountMinor: 4000, currency: 'EUR' } });
    expect(explainChange(euro, previous)).toBeUndefined();
  });

  it('describes paid and overdue invoices', () => {
    expect(summariseInvoice(invoice('INV-1', 100, { status: 'PAID' })).text).toContain('paid in full');
    expect(summariseInvoice(invoice('INV-1', 100, { status: 'OVERDUE' })).text).toContain("It's overdue: £1.00");
  });

  it('orders breakdown lines recurring first and credits last', () => {
    const lines = formatLines(
      invoice('INV-1', 0, {
        lines: [
          { description: 'Goodwill credit', amount: gbp(-500), category: 'CREDIT' },
          { description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' },
          { description: 'Calls', amount: gbp(120), category: 'USAGE' },
        ],
      }),
    ).split('\n');
    expect(lines).toEqual(['- Fibre 500 monthly: £35.00', '- Calls: £1.20', '- Goodwill credit: -£5.00']);
  });
});
