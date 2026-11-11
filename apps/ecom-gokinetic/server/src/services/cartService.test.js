'use strict';

const { createWorld, principals } = require('../../tests/support/world');
const { ADDRESS } = require('../../tests/support/fakes');

const { consumer } = principals;

describe('cartService', () => {
  let world;
  let carts;
  beforeEach(() => {
    world = createWorld({
      serviceabilityByZip: { 10001: { serviceable: true, maxDownloadMbps: 500 }, 99501: { serviceable: false } },
      promos: [{ code: 'FREEINSTALL', kind: 'FREE_INSTALLATION', segments: ['CONSUMER'] }],
    });
    carts = world.services.cartService;
  });

  test('guest carts are only reachable with their token', async () => {
    const { cart, guestToken } = await carts.create({ segment: 'CONSUMER' }, null);
    expect(guestToken).toMatch(/^[a-f0-9]{48}$/);
    await expect(carts.get(cart.id, null, 'wrong-token')).rejects.toMatchObject({ status: 403 });
    await expect(carts.get(cart.id, null, guestToken)).resolves.toMatchObject({ id: cart.id });
  });

  test('a signed-in shopper reuses their open cart', async () => {
    const first = await carts.create({ segment: 'CONSUMER' }, consumer);
    const second = await carts.create({ segment: 'CONSUMER' }, consumer);
    expect(second.cart.id).toBe(first.cart.id);
    expect(second.guestToken).toBeNull();
  });

  test('refuses a cart for the other storefront', async () => {
    await expect(carts.create({ segment: 'BUSINESS' }, consumer)).rejects.toMatchObject({ code: 'SEGMENT_MISMATCH' });
  });

  test('swapping plans removes add-ons the new plan does not support', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    await carts.addItem(cart.id, { sku: 'ADD-STATIC-IP', quantity: 1 }, consumer, null);
    const view = await carts.addItem(cart.id, { sku: 'GK-FIBRE-500', quantity: 1 }, consumer, null);
    expect(view.items.map((i) => i.sku)).toEqual(['GK-FIBRE-500']);
    expect(view.warnings).toContainEqual(expect.objectContaining({ code: 'ADDONS_REMOVED', skus: ['ADD-STATIC-IP'] }));
  });

  test.each([
    ['ADD-STATIC-IP', 1, 'PLAN_REQUIRED'],
    ['GK-FIBRE-1000', 2, 'PLAN_QUANTITY_LIMIT'],
    ['BGK-FIBRE-1000', 1, 'PRODUCT_NOT_IN_SEGMENT'],
    ['HW-MESH-EXTENDER', 3, 'OUT_OF_STOCK'],
  ])('adding %s x%i fails with %s', async (sku, quantity, code) => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await expect(carts.addItem(cart.id, { sku, quantity }, consumer, null)).rejects.toMatchObject({ code });
  });

  test('address with a slower line blocks a faster plan', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const view = await carts.setServiceAddress(cart.id, { address: { ...ADDRESS, state: 'NY', postalCode: '10001' } }, consumer, null);
    expect(view.serviceability.availablePlanSkus).toEqual(['GK-FIBRE-500']);
    expect(view.warnings).toContainEqual(expect.objectContaining({ code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS' }));
    expect(view.readyForCheckout).toBe(false);
    await expect(carts.addItem(cart.id, { sku: 'GK-FIBRE-2000', quantity: 1 }, consumer, null)).rejects.toMatchObject({
      code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS',
    });
  });

  test('a qualified address with a plan is ready for checkout and taxed by state', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const view = await carts.setServiceAddress(cart.id, { address: ADDRESS }, consumer, null);
    expect(view.readyForCheckout).toBe(true);
    expect(view.serviceAddress.line1).toBe('12 MAIN ST');
    expect(view.pricing.taxBps).toBe(625);
  });

  test('promo codes are validated before being stored', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null);
    const noContract = await carts.setContractTerm(cart.id, { contractTermMonths: 0 }, consumer, null);
    expect(noContract.pricing.dueToday).toBe(9900);
    await expect(carts.applyPromo(cart.id, { code: 'NOPE-CODE' }, consumer, null)).rejects.toMatchObject({ code: 'PROMO_NOT_FOUND' });
    const view = await carts.applyPromo(cart.id, { code: 'FREEINSTALL' }, consumer, null);
    expect(view.promoCode).toBe('FREEINSTALL');
    expect(view.pricing.dueToday).toBe(0);
  });

  test('concurrent edits surface as a 409 version conflict', async () => {
    const { cart } = await carts.create({ segment: 'CONSUMER' }, consumer);
    world.repos.carts.updateVersioned = async () => null;
    await expect(carts.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, consumer, null)).rejects.toMatchObject({
      status: 409,
      extensions: { code: 'CART_VERSION_CONFLICT' },
    });
  });

  test('claiming a guest cart merges it into the shopper\'s open cart', async () => {
    const mine = await carts.create({ segment: 'CONSUMER' }, consumer);
    await carts.addItem(mine.cart.id, { sku: 'GK-FIBRE-500', quantity: 1 }, consumer, null);
    const guest = await carts.create({ segment: 'CONSUMER' }, null);
    await carts.addItem(guest.cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, null, guest.guestToken);
    await carts.addItem(guest.cart.id, { sku: 'ADD-STATIC-IP', quantity: 1 }, null, guest.guestToken);

    const merged = await carts.claim(guest.cart.id, guest.guestToken, consumer);
    expect(merged.id).toBe(mine.cart.id);
    expect(merged.items.map((i) => i.sku).sort()).toEqual(['ADD-STATIC-IP', 'GK-FIBRE-1000']);
    expect(world.repos.carts.rows.get(guest.cart.id).status).toBe('ABANDONED');
  });
});
