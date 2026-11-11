'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');

const { consumer, otherConsumer, agent } = principals;

describe('orderService', () => {
  let world;
  let orders;
  beforeEach(() => {
    world = createWorld();
    orders = world.services.orderService;
  });

  test('processSubmitted captures payment, validates and books the install', async () => {
    const placed = await placeOrder(world, consumer);
    const result = await orders.processSubmitted(placed);
    expect(result).toEqual({ orderNumber: placed.orderNumber, outcome: 'PROVISIONING' });

    const stored = await world.repos.orders.findByNumber(placed.orderNumber);
    expect(stored.status).toBe('PROVISIONING');
    expect(stored.payment).toMatchObject({ status: 'CAPTURED', capturedAmount: placed.dueToday });
    expect(stored.installAppointment).toEqual(new Date('2026-12-01T13:00:00Z'));
    const templates = world.notifier.sent.filter((m) => m.template === 'ORDER_STATUS_CHANGED').map((m) => m.data.status);
    expect(templates).toEqual(['VALIDATED', 'PROVISIONING']);
  });

  test('processSubmitted fails the order and voids payment when the address no longer qualifies', async () => {
    const placed = await placeOrder(world, consumer);
    world.api.qualify = async () => ({ serviceable: false, technology: null, maxDownloadMbps: 0, maxUploadMbps: 0, reasonCode: 'NETWORK_CHANGE' });

    const result = await orders.processSubmitted(placed);
    expect(result.outcome).toBe('FAILED');
    const stored = await world.repos.orders.findByNumber(placed.orderNumber);
    expect(stored).toMatchObject({ status: 'FAILED', payment: expect.objectContaining({ status: 'VOIDED' }) });
    expect(world.gateway.calls.map(([n]) => n)).toEqual(['authorize', 'void']);
  });

  test('customers can cancel before installation and the hold is released', async () => {
    const placed = await placeOrder(world, consumer);
    const cancelled = await orders.cancel(consumer, placed.orderNumber, { reason: 'Moving house' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Moving house' });
    expect(cancelled.payment.status).toBe('VOIDED');
  });

  test('cancelling once provisioning has started is refused', async () => {
    const placed = await placeOrder(world, consumer);
    await orders.processSubmitted(placed);
    await expect(orders.cancel(consumer, placed.orderNumber, { reason: 'Changed mind' })).rejects.toMatchObject({
      code: 'ORDER_NOT_CANCELLABLE',
    });
  });

  test('other accounts cannot see the order (404, not 403)', async () => {
    const placed = await placeOrder(world, consumer);
    await expect(orders.get(otherConsumer, placed.orderNumber)).rejects.toMatchObject({ status: 404 });
    await expect(orders.get(agent, placed.orderNumber)).resolves.toMatchObject({ orderNumber: placed.orderNumber });
  });

  test('tracking reports milestones and self-cancel eligibility', async () => {
    const placed = await placeOrder(world, consumer);
    const tracking = await orders.track(consumer, placed.orderNumber);
    expect(tracking.canCancel).toBe(true);
    expect(tracking.timeline.steps.map((s) => s.state)).toEqual(['CURRENT', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
  });

  test('support activation marks the account as an existing customer', async () => {
    const placed = await placeOrder(world, consumer);
    await orders.processSubmitted(placed);
    const active = await orders.advance(agent, placed.orderNumber, { status: 'ACTIVE' });
    expect(active.status).toBe('ACTIVE');
    expect(active.activatedAt).toBeInstanceOf(Date);
    expect(world.repos.accounts.rows.get('ACC-00000001').existingCustomer).toBe(true);
  });

  test('invalid transitions are rejected', async () => {
    const placed = await placeOrder(world, consumer);
    await expect(orders.advance(agent, placed.orderNumber, { status: 'ACTIVE' })).rejects.toMatchObject({ status: 409 });
  });
});
