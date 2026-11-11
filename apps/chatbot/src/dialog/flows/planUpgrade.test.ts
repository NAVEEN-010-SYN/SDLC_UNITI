import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account, gbp } from '../../testing/fakes';
import { eligibleUpgrades } from './planUpgrade';

describe('eligibleUpgrades', () => {
  const current = account().services[0];
  const offer = (code: string, downloadMbps: number, amountMinor: number, currency = 'GBP') => ({
    code,
    name: code,
    downloadMbps,
    uploadMbps: 100,
    monthly: { amountMinor, currency },
    contractMonths: 18,
  });

  it('keeps only strictly faster plans in the same currency, slowest then cheapest first', () => {
    const result = eligibleUpgrades(current, [
      offer('SAME', 500, 3000),
      offer('GIG-B', 1000, 6000),
      offer('GIG-A', 1000, 5500),
      offer('EURO', 900, 4000, 'EUR'),
      offer('NINE', 900, 4500),
    ]);
    expect(result.map((o) => o.code)).toEqual(['NINE', 'GIG-A', 'GIG-B']);
  });
});

describe('plan upgrade flow', () => {
  it('lists faster plans with the monthly price difference and submits the chosen one', async () => {
    const chat = new ChatHarness();
    const list = await chat.say('I want to upgrade my plan');
    expect(list.text).toContain("You're on Fibre 500 (500 Mbps)");
    expect(list.text).toContain('1. Fibre 900 - 900 Mbps for £45.00/month (+£10.00)');
    expect(list.text).toContain('2. Gigabit - 1 Gbps for £55.00/month (+£20.00)');
    expect(list.text).not.toContain('Fibre 100');
    expect(list.replies[0].card).toMatchObject({ kind: 'PLANS', plans: [expect.objectContaining({ code: 'FIBRE-900', monthly: gbp(4500) }), expect.anything()] });

    const quote = await chat.say('2');
    expect(quote.text).toBe('Gigabit (1 Gbps) is £55.00 a month on a 18-month contract. Shall I place the upgrade?');

    const done = await chat.say('yes');
    expect(done.text).toContain('Your upgrade is order ORD-0001');
    expect(chat.clients.billing.planChanges).toEqual([
      { serviceId: 'SVC-1', planCode: 'FIBRE-1000', key: expect.stringMatching(/plan-change-SVC-1-FIBRE-1000$/) },
    ]);
    expect(outcomeOf(done, 'plan_upgrade')).toBe('order_submitted');
  });

  it('accepts a plan by its speed alias', async () => {
    const chat = new ChatHarness();
    await chat.say('upgrade my plan');
    const quote = await chat.say('900 mbps');
    expect(quote.text).toContain('Fibre 900 (900 Mbps)');
  });

  it('jumps straight to a quote when the opening message names an offered speed', async () => {
    const chat = new ChatHarness();
    const quote = await chat.say('upgrade me to 1 gig');
    expect(quote.text).toContain('Gigabit (1 Gbps) is £55.00 a month');
    expect(chat.awaiting).toBe('quote');
  });

  it('shows the list when the requested speed is not offered at the address', async () => {
    const chat = new ChatHarness();
    const list = await chat.say('upgrade me to 2 gig');
    expect(list.text).toContain("Here's what you can move to");
    expect(chat.awaiting).toBe('planCode');
  });

  it('changes nothing when the customer declines the quote', async () => {
    const chat = new ChatHarness();
    await chat.say('upgrade me to 1 gig');
    const declined = await chat.say('no');
    expect(declined.text).toContain('nothing has been changed');
    expect(chat.clients.billing.planChanges).toHaveLength(0);
  });

  it('tells top-tier customers there is nothing faster', async () => {
    const chat = new ChatHarness();
    const base = account().services[0];
    chat.clients.account.summary = account({ services: [{ ...base, downloadMbps: 2000 }] });
    const turn = await chat.say('upgrade my plan');
    expect(outcomeOf(turn, 'plan_upgrade')).toBe('already_top_tier');
  });

  it('reports when no faster plans exist at the address', async () => {
    const chat = new ChatHarness();
    chat.clients.billing.offers = [];
    const turn = await chat.say('upgrade my plan');
    expect(turn.text).toContain('no faster plans available at SW1A 1AA');
  });

  it('reports a failed order honestly', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.billing, 'submitPlanChange').mockResolvedValue({ orderId: 'ORD-9', status: 'FAILED', effectiveDate: '2026-11-20T00:00:00Z' });
    await chat.say('upgrade me to 1 gig');
    const turn = await chat.say('yes');
    expect(turn.text).toContain("order ORD-9 couldn't be completed");
    expect(outcomeOf(turn, 'plan_upgrade')).toBe('order_failed');
  });

  it.each([['BUSINESS_USER'], ['PARTNER_AGENT']] as const)('does not let %s change plans', async (role) => {
    const chat = new ChatHarness({ principal: { roles: [role] } });
    await chat.say('upgrade my plan');
    expect(chat.activeFlowId).toBeUndefined();
    expect(chat.clients.billing.planChanges).toHaveLength(0);
  });
});
