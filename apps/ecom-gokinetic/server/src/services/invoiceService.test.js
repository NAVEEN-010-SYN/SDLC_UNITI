'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');

const { consumer, otherConsumer, agent } = principals;

describe('invoiceService', () => {
  let world;
  let invoices;
  let order;
  beforeEach(async () => {
    world = createWorld();
    invoices = world.services.invoiceService;
    const placed = await placeOrder(world, consumer);
    await world.services.orderService.processSubmitted(placed);
    order = await world.repos.orders.findByNumber(placed.orderNumber);
  });

  test('issues a paid initial invoice for captured checkout charges', async () => {
    const invoice = await invoices.issueInitial(order);
    expect(invoice).toMatchObject({ kind: 'INITIAL', status: 'PAID', total: 10519, orderNumber: order.orderNumber });
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}-[A-Z0-9]{6}$/);
    // Re-issuing is a no-op.
    await invoices.issueInitial(order);
    expect(world.repos.invoices.rows).toHaveLength(1);
  });

  test('the billing cycle invoices active services once per period', async () => {
    await world.services.orderService.advance(agent, order.orderNumber, { status: 'ACTIVE' });
    const asOf = new Date(Date.now() + 60000);
    expect(await invoices.runBillingCycle(asOf)).toEqual({ issued: 1, skipped: 0, failed: 0 });
    expect(await invoices.runBillingCycle(asOf)).toEqual({ issued: 0, skipped: 1, failed: 0 });
    const recurring = world.repos.invoices.rows.find((i) => i.kind === 'RECURRING');
    expect(recurring.status).toBe('ISSUED');
    expect(recurring.lines[0].sku).toBe('GK-FIBRE-1000');
  });

  test('cancellation voids open invoices', async () => {
    await world.services.orderService.advance(agent, order.orderNumber, { status: 'ACTIVE' });
    await invoices.runBillingCycle(new Date(Date.now() + 60000));
    expect(await invoices.voidForOrder(order.orderNumber)).toBe(1);
  });

  test('customers only see their own invoices', async () => {
    const invoice = await invoices.issueInitial(order);
    const page = await invoices.list(consumer, { page: 1, pageSize: 20 });
    expect(page.items.map((i) => i.invoiceNumber)).toEqual([invoice.invoiceNumber]);
    expect(page.items[0].displayStatus).toBe('PAID');
    await expect(invoices.get(otherConsumer, invoice.invoiceNumber)).rejects.toMatchObject({ status: 404 });
  });
});
