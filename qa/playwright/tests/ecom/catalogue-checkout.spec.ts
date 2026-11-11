import { test, expect } from '@fixtures/test';
import { AddressBuilder } from '@data/builders';

/**
 * Residential buy flow on GoKinetic: qualify address -> choose plan -> add-on
 * -> checkout -> order lands in SUBMITTED and progresses to VALIDATED.
 */

const SANDBOX_CARD = { number: '4242424242424242', expiry: '12 / 34', cvc: '123', postalCode: '72201' };

const CONTACT = {
  firstName: 'Quinn',
  lastName: 'Ashford',
  email: 'qa.consumer+checkout@example.net',
  phone: '5015550142',
};

test.describe('Catalogue and checkout @ecom', () => {
  test.beforeEach(async ({ catalogue }) => {
    await catalogue.goto();
  });

  test('serviceable address shows fibre plans in ascending speed order @smoke', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.expectServiceable();

    const names = await catalogue.visiblePlanNames();
    const speeds = names.map((name) => {
      const match = name.match(/(\d+)\s*(Mbps|Gbps)/);
      expect(match, `plan name "${name}" should state a speed`).not.toBeNull();
      const [, value, unit] = match as RegExpMatchArray;
      return Number(value) * (unit === 'Gbps' ? 1000 : 1);
    });
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
  });

  test('out-of-footprint address offers waitlist instead of plans', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.outOfFootprint().build());
    await catalogue.expectNotServiceable();
    await expect(catalogue.planCards).toHaveCount(0);
  });

  test('speed filter narrows the plan grid', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.filterBySpeed('1 Gbps');
    const names = await catalogue.visiblePlanNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toContain('1 Gbps');
    }
  });

  test('plan price on the card matches the catalogue API', async ({ catalogue, seed }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    const products = await seed.listProducts('B2C');
    const plan = products.items.find((product) => product.sku === 'FIB-500');
    expect(plan, 'FIB-500 should be in the B2C catalogue').toBeDefined();

    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: plan!.monthlyPrice.currency }).format(
      plan!.monthlyPrice.amountMinor / 100,
    );
    expect(await catalogue.planPrice('FIB-500')).toContain(expected);
  });

  test('complete residential checkout creates a submitted order @smoke', async ({ catalogue, checkout, seed, cleanup }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-1000');
    await catalogue.addOn('Whole-home Wi-Fi');
    await catalogue.continueToCheckout();

    await checkout.fillContact(CONTACT);
    const slot = await checkout.chooseFirstInstallSlot();
    expect(slot).not.toBe('');
    await checkout.payWithSandboxCard(SANDBOX_CARD);
    await checkout.expectSummaryContains('1 Gbps', 'Whole-home Wi-Fi');

    const orderId = await checkout.submitOrder();
    cleanup(() => seed.cancelOrder(orderId));

    const order = await seed.getOrder(orderId);
    expect(['SUBMITTED', 'VALIDATED']).toContain(order.status);
    expect(order.lines.map((line) => line.sku)).toEqual(expect.arrayContaining(['FIB-1000', 'WIFI-MESH']));
    expect(Number.isInteger(order.total.amountMinor)).toBe(true);

    const validated = await seed.waitForOrderStatus(orderId, 'VALIDATED');
    expect(validated.serviceAddress.postalCode).toBe('72201');
  });

  test('order cannot be placed until terms are accepted', async ({ catalogue, checkout }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.fillContact(CONTACT);
    await checkout.chooseFirstInstallSlot();
    await checkout.payWithSandboxCard(SANDBOX_CARD);
    await checkout.expectPlaceOrderBlockedUntilTermsAccepted();
  });

  test('declined sandbox card surfaces a problem banner and keeps the cart', async ({ catalogue, checkout, page }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.fillContact(CONTACT);
    await checkout.chooseFirstInstallSlot();
    await checkout.payWithSandboxCard({ ...SANDBOX_CARD, number: '4000000000000002' });

    await checkout.expectProblem(/payment was declined/i);
    expect(await checkout.problemCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page).toHaveURL(/\/checkout\/payment/);
    await page.goto('/plans');
    expect(await catalogue.cartCount()).toBe(1);
  });

  test('invalid promo code is rejected with a field-level message', async ({ catalogue, checkout }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.applyPromoCode('NOT-A-REAL-CODE');
    await expect(checkout.summary.getByText(/promo code is not valid/i)).toBeVisible();
  });
});

test.describe('Business catalogue @ecom', () => {
  test('business segment shows only B2B plans with contract terms', async ({ page, seed }) => {
    const { CataloguePage } = await import('@pages/CataloguePage');
    const business = new CataloguePage(page, 'business');
    await business.goto();
    await business.qualifyAddress(AddressBuilder.serviceable().withUnit('Suite 400').build());
    await business.expectServiceable();

    const products = await seed.listProducts('B2B');
    const broadband = products.items.filter((product) => product.category === 'BROADBAND');
    await expect(business.planCards).toHaveCount(broadband.length);
    await expect(business.planCards.first().getByTestId('contract-term')).toHaveText(/\d+-month term/);
  });
});
