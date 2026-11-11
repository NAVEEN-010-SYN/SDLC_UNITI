'use strict';

const { createWorld, principals } = require('../../tests/support/world');
const { ADDRESS } = require('../../tests/support/fakes');

const { businessAdmin, consumer, agent, agent2 } = principals;

const REQUEST = {
  companyName: 'Acme Corp',
  contactEmail: 'ops@acme.example',
  items: [
    { sku: 'BGK-FIBRE-1000', quantity: 1 },
    { sku: 'ADD-STATIC-IP', quantity: 2 },
  ],
  sites: [ADDRESS, { ...ADDRESS, line1: '1 Frontier Rd', city: 'Anchorage', state: 'AK', postalCode: '99501' }, { ...ADDRESS, line1: '400 Congress Ave' }],
  contractTermMonths: 36,
};

describe('quoteService', () => {
  let world;
  let quotes;
  beforeEach(() => {
    world = createWorld({ serviceabilityByZip: { 99501: { serviceable: false } } });
    quotes = world.services.quoteService;
  });

  test('auto-prices only the serviceable sites', async () => {
    const quote = await quotes.request(businessAdmin, REQUEST);
    expect(quote.status).toBe('PRICED');
    expect(quote.sites.map((s) => s.serviceable)).toEqual([true, false, true]);
    expect(quote.pricing.pricedSiteCount).toBe(2);
    expect(quote.pricing.lines.find((l) => l.sku === 'ADD-STATIC-IP').quantity).toBe(4);
  });

  test('consumers cannot request quotes', async () => {
    await expect(quotes.request(consumer, REQUEST)).rejects.toMatchObject({ status: 403 });
  });

  test('a site bundle needs exactly one plan', async () => {
    await expect(
      quotes.request(businessAdmin, { ...REQUEST, items: [{ sku: 'ADD-STATIC-IP', quantity: 1 }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('deep discounts need a second agent before the quote is sent', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    const priced = await quotes.price(agent, requested.quoteNumber, { negotiatedDiscountBps: 2000 });
    expect(priced).toMatchObject({ requiresApproval: true, pricedBy: agent.id, revision: requested.revision + 1 });

    const pending = await quotes.send(agent, requested.quoteNumber);
    expect(pending.status).toBe('PENDING_APPROVAL');
    await expect(quotes.approve(agent, requested.quoteNumber)).rejects.toMatchObject({ status: 403 });

    const sent = await quotes.approve(agent2, requested.quoteNumber);
    expect(sent).toMatchObject({ status: 'SENT', approvedBy: agent2.id });
    expect(sent.validUntil).toBeInstanceOf(Date);
    expect(world.notifier.sent.map((m) => m.template)).toContain('QUOTE_SENT');
  });

  test('accepting and converting creates one order per serviceable site', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    await quotes.accept(businessAdmin, requested.quoteNumber, { poNumber: 'PO-7781' });

    await expect(quotes.convert(businessAdmin, requested.quoteNumber, {})).rejects.toMatchObject({ status: 400 });
    const { quote, orders } = await quotes.convert(businessAdmin, requested.quoteNumber, { paymentToken: 'tok_business' });

    expect(quote.status).toBe('CONVERTED');
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.status === 'SUBMITTED' && o.sourceQuoteNumber === requested.quoteNumber)).toBe(true);
    const authorizations = world.gateway.calls.filter(([n]) => n === 'authorize');
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0][1].amount).toBe(orders.reduce((a, o) => a + o.dueToday, 0));
    // Each per-site order keeps the volume tier earned by the whole quote.
    expect(orders[0].pricing.siteCount).toBe(2);
  });

  test('accounts on credit terms are invoiced instead of charged', async () => {
    world.repos.accounts.rows.get(businessAdmin.accountId).creditTermsDays = 30;
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    await quotes.accept(businessAdmin, requested.quoteNumber, {});
    const { orders } = await quotes.convert(businessAdmin, requested.quoteNumber, {});
    expect(orders.every((o) => o.payment.status === 'NOT_REQUIRED')).toBe(true);
    expect(world.gateway.calls).toHaveLength(0);
  });

  test('expireDue expires sent quotes past their validity', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    world.repos.quotes.rows.get(requested.quoteNumber).validUntil = new Date(Date.now() - 1000);
    expect(await quotes.expireDue()).toBe(1);
    expect(world.repos.quotes.rows.get(requested.quoteNumber).status).toBe('EXPIRED');
  });
});
