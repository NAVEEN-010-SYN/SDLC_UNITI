'use strict';

const { priceItems, volumeDiscountBps } = require('./pricing');

const plan = (overrides = {}) => ({
  sku: 'GK-FIBRE-1000',
  productType: 'PLAN',
  quantity: 1,
  unitMonthly: 8000,
  unitOneTime: 0,
  unitInstallation: 9900,
  ...overrides,
});

describe('priceItems', () => {
  test('24-month term discounts the plan, waives installation and taxes the net', () => {
    const result = priceItems({ lines: [plan()], contractTermMonths: 24, taxBps: 625 });
    expect(result.recurring).toMatchObject({ subtotal: 8000, termDiscount: 400, taxable: 7600, tax: 475, total: 8075 });
    expect(result.oneTime).toMatchObject({ installation: 9900, installationWaived: 9900, total: 0 });
    expect(result.dueToday).toBe(0);
    expect(result.totalContractValue).toBe(8075 * 24);
  });

  test('no-contract plans pay installation up front and have no contract value', () => {
    const result = priceItems({ lines: [plan()], contractTermMonths: 0 });
    expect(result.dueToday).toBe(9900);
    expect(result.recurring.total).toBe(8000);
    expect(result.totalContractValue).toBeNull();
  });

  test('term discounts never apply to add-ons or hardware', () => {
    const result = priceItems({
      lines: [plan(), { sku: 'ADD-STATIC-IP', productType: 'ADDON', quantity: 2, unitMonthly: 1000 }],
      contractTermMonths: 36,
    });
    expect(result.recurring.termDiscount).toBe(800);
    expect(result.lines.find((l) => l.sku === 'ADD-STATIC-IP').monthlyNet).toBe(2000);
  });

  test('business volume tier stacks after the term discount', () => {
    const result = priceItems({
      lines: [plan({ sku: 'BGK-FIBRE-1000', unitMonthly: 14900, quantity: 10 })],
      contractTermMonths: 36,
      segment: 'BUSINESS',
    });
    expect(result.volumeDiscountBps).toBe(1000);
    expect(result.recurring.termDiscount).toBe(14900);
    expect(result.recurring.volumeDiscount).toBe(13410);
    expect(result.recurring.taxable).toBe(120690);
  });

  test('siteCountOverride keeps the estate-wide tier on per-site orders', () => {
    const result = priceItems({
      lines: [plan({ unitMonthly: 10000 })],
      contractTermMonths: 12,
      segment: 'BUSINESS',
      siteCountOverride: 25,
    });
    expect(result.volumeDiscountBps).toBe(1500);
    expect(result.recurring.taxable).toBe(8500);
  });

  test('FREE_INSTALLATION removes the installation charge', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'FREEINSTALL', kind: 'FREE_INSTALLATION' },
    });
    expect(result.dueToday).toBe(0);
    expect(result.promo).toMatchObject({ applied: true, oneTimeDiscount: 9900 });
  });

  test('FIXED_OFF consumes one-time charges first, then recurring', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'SAVE120', kind: 'FIXED_OFF', valueAmount: 12000 },
    });
    expect(result.oneTime.promoDiscount).toBe(9900);
    expect(result.recurring.promoDiscount).toBe(2100);
  });

  test('PERCENT_OFF honours its cap', () => {
    const result = priceItems({
      lines: [plan({ unitMonthly: 20000, unitInstallation: 0 })],
      promo: { code: 'HALF', kind: 'PERCENT_OFF', valueBps: 5000, maxDiscountAmount: 3000 },
    });
    expect(result.recurring.promoDiscount).toBe(3000);
  });

  test('FREE_MONTHS credits the first bill including tax', () => {
    const result = priceItems({
      lines: [plan()],
      contractTermMonths: 24,
      taxBps: 625,
      promo: { code: 'WELCOME-3FREE', kind: 'FREE_MONTHS', freeMonths: 3 },
    });
    expect(result.introductory).toEqual({ freeMonths: 3, monthlyCredit: 8075 });
    expect(result.firstMonthlyBill).toBe(0);
    expect(result.totalContractValue).toBe(8075 * 21);
  });

  test('promo restricted to other SKUs is reported but not applied', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'IPDEAL', kind: 'PERCENT_OFF', valueBps: 1000, eligibleSkus: ['ADD-STATIC-IP'] },
    });
    expect(result.promo).toMatchObject({ applied: false, reason: 'NO_ELIGIBLE_ITEMS' });
  });

  test('rejects unsupported terms and malformed lines', () => {
    expect(() => priceItems({ lines: [plan()], contractTermMonths: 18 })).toThrow(RangeError);
    expect(() => priceItems({ lines: [plan({ quantity: 0 })] })).toThrow(RangeError);
    expect(() => priceItems({ lines: [plan({ unitMonthly: 10.5 })] })).toThrow(RangeError);
  });
});

describe('volumeDiscountBps', () => {
  test.each([
    [1, 0],
    [4, 0],
    [5, 500],
    [10, 1000],
    [24, 1000],
    [25, 1500],
  ])('%i sites -> %i bps', (sites, bps) => {
    expect(volumeDiscountBps(sites)).toBe(bps);
  });
});
