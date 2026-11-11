'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');
const { PaymentDeclinedError } = require('../errors');

const { consumer } = principals;
const WITH_MESH = [
  { sku: 'GK-FIBRE-1000', quantity: 1 },
  { sku: 'HW-MESH-EXTENDER', quantity: 1 },
];

describe('checkoutService.placeOrder', () => {
  let world;
  beforeEach(() => {
    world = createWorld({
      promos: [{ code: 'FREEINSTALL', kind: 'FREE_INSTALLATION', segments: ['CONSUMER'], maxRedemptions: 10 }],
    });
  });

  test('submits the order, authorises due-today and closes the cart', async () => {
    const order = await placeOrder(world, consumer, { items: WITH_MESH });

    expect(order).toMatchObject({ status: 'SUBMITTED', dueToday: 24225, monthlyRecurring: 8500 });
    expect(order.orderNumber).toMatch(/^GK-\d{8}-[A-Z0-9]{6}$/);
    expect(order.payment).toMatchObject({ status: 'AUTHORIZED', authorizedAmount: 24225, last4: '4242' });
    expect(order.statusHistory.map((h) => h.to)).toEqual(['DRAFT', 'SUBMITTED']);
    expect(world.repos.products.rows.find((p) => p.sku === 'HW-MESH-EXTENDER').stockOnHand).toBe(1);
    expect(world.repos.carts.rows.get(order.cartId).status).toBe('CHECKED_OUT');
    expect(world.notifier.sent).toContainEqual(expect.objectContaining({ template: 'ORDER_CONFIRMATION', reference: order.orderNumber }));
  });

  test('a declined card cancels the draft and returns reserved stock', async () => {
    world.gateway.decline = new PaymentDeclinedError('The card has insufficient funds.', { declineCode: 'insufficient_funds' });
    await expect(placeOrder(world, consumer, { items: WITH_MESH })).rejects.toBeInstanceOf(PaymentDeclinedError);

    const [order] = [...world.repos.orders.rows.values()];
    expect(order.status).toBe('CANCELLED');
    expect(order.payment).toMatchObject({ status: 'FAILED', failureCode: 'insufficient_funds' });
    expect(world.repos.products.rows.find((p) => p.sku === 'HW-MESH-EXTENDER').stockOnHand).toBe(2);
    const cart = world.repos.carts.rows.get(order.cartId);
    expect(cart.status).toBe('OPEN');
  });

  test('a promo exhausted mid-checkout voids the authorisation', async () => {
    world.repos.promos.claimRedemption = async () => false;
    await expect(placeOrder(world, consumer, { promoCode: 'FREEINSTALL', items: WITH_MESH })).rejects.toMatchObject({
      code: 'PROMO_USAGE_EXHAUSTED',
    });
    const [order] = [...world.repos.orders.rows.values()];
    expect(order.status).toBe('CANCELLED');
    expect(world.gateway.calls.map(([name]) => name)).toEqual(['authorize', 'void']);
  });

  test('records the redemption when the promo applies', async () => {
    const order = await placeOrder(world, consumer, { promoCode: 'FREEINSTALL' });
    expect(order.promoCode).toBe('FREEINSTALL');
    expect(order.dueToday).toBe(0);
    expect(order.payment.status).toBe('NOT_REQUIRED');
    expect(world.repos.promos.redemptions).toHaveLength(1);
  });

  test('requires a checked address', async () => {
    const { cartService, checkoutService } = world.services;
    const { cart } = await cartService.create({ segment: 'CONSUMER' }, consumer);
    await cartService.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    await expect(
      checkoutService.placeOrder(consumer, { cartId: cart.id, paymentToken: 'tok_x', contact: {}, acceptTerms: true }),
    ).rejects.toMatchObject({ code: 'SERVICE_ADDRESS_REQUIRED' });
  });

  test('guest carts must be claimed before checkout', async () => {
    const { cartService, checkoutService } = world.services;
    const { cart } = await cartService.create({ segment: 'CONSUMER' }, null);
    await expect(
      checkoutService.placeOrder(consumer, { cartId: cart.id, paymentToken: 'tok_x', contact: {}, acceptTerms: true }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
