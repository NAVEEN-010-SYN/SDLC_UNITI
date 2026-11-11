'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');
const { orderValidationJob, abandonedCartJob } = require('./index');
const { createScheduler } = require('./scheduler');

const silentLog = { info() {}, warn() {}, error() {}, debug() {} };

describe('orderValidationJob', () => {
  test('provisions submitted orders and issues their checkout invoice', async () => {
    const world = createWorld();
    const placed = await placeOrder(world, principals.consumer);
    const run = orderValidationJob({
      orders: world.repos.orders,
      orderService: world.services.orderService,
      invoiceService: world.services.invoiceService,
      log: silentLog,
    });
    const result = await run();
    expect(result).toMatchObject({ scanned: 1, PROVISIONING: 1, ERROR: 0 });
    expect(world.repos.invoices.rows).toEqual([expect.objectContaining({ orderNumber: placed.orderNumber, kind: 'INITIAL', status: 'PAID' })]);
  });

  test('upstream outages leave the order for the next run', async () => {
    const world = createWorld();
    await placeOrder(world, principals.consumer);
    world.api.qualify = async () => {
      throw Object.assign(new Error('serviceability-api timed out'), { status: 502 });
    };
    const run = orderValidationJob({
      orders: world.repos.orders,
      orderService: world.services.orderService,
      invoiceService: world.services.invoiceService,
      log: silentLog,
    });
    expect(await run()).toMatchObject({ ERROR: 1 });
    expect([...world.repos.orders.rows.values()][0].status).toBe('SUBMITTED');
  });
});

describe('abandonedCartJob', () => {
  const setup = async (marketingOptIn) => {
    const users = [{ id: 'u-consumer', email: 'ada@example.com', firstName: 'Ada', lastName: 'L', accountId: 'ACC-00000001', marketingOptIn }];
    const world = createWorld({ users });
    const { cart } = await world.services.cartService.create({ segment: 'CONSUMER' }, principals.consumer);
    await world.services.cartService.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, principals.consumer, null);
    world.repos.carts.rows.get(cart.id).updatedAt = new Date(Date.now() - 48 * 3600 * 1000);
    const run = abandonedCartJob({
      carts: world.repos.carts,
      users: world.repos.users,
      notifier: world.notifier,
      storefrontUrl: 'https://shop.example',
      idleHours: 24,
    });
    return { world, run, cartId: cart.id };
  };

  test('reminds opted-in shoppers once', async () => {
    const { world, run, cartId } = await setup(true);
    expect(await run()).toMatchObject({ candidates: 1, reminded: 1 });
    expect(world.notifier.sent[0].data.resumeUrl).toBe(`https://shop.example/cart?resume=${cartId}`);
    expect(await run()).toMatchObject({ candidates: 0, reminded: 0 });
  });

  test('never emails shoppers who opted out', async () => {
    const { world, run } = await setup(false);
    expect(await run()).toMatchObject({ candidates: 1, reminded: 0 });
    expect(world.notifier.sent).toHaveLength(0);
  });
});

describe('scheduler', () => {
  test('never overlaps a job with itself and records failures', async () => {
    const scheduler = createScheduler({ log: silentLog });
    let release;
    scheduler.register('slow', 1000, () => new Promise((resolve) => { release = resolve; }));
    scheduler.register('broken', 1000, async () => {
      throw new Error('boom');
    });

    const first = scheduler.runNow('slow');
    expect(await scheduler.runNow('slow')).toEqual({ skipped: true });
    release('done');
    expect(await first).toEqual({ skipped: false, result: 'done' });

    await scheduler.runNow('broken');
    expect(scheduler.status().find((j) => j.name === 'broken').lastError).toBe('boom');
  });

  test('rejects duplicate names and too-frequent intervals', () => {
    const scheduler = createScheduler({ log: silentLog });
    scheduler.register('a', 1000, async () => {});
    expect(() => scheduler.register('a', 1000, async () => {})).toThrow();
    expect(() => scheduler.register('b', 10, async () => {})).toThrow(RangeError);
  });
});
