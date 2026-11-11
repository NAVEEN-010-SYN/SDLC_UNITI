'use strict';

const {
  billingPeriod,
  prorate,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
  generateInvoiceNumber,
} = require('./billing');

const activeOrder = (overrides = {}) => ({
  orderNumber: 'GK-20260310-ABCDEF',
  accountId: 'ACC-00000001',
  currency: 'USD',
  activatedAt: new Date('2026-03-15T16:30:00Z'),
  items: [{ sku: 'GK-FIBRE-1000', name: 'Fibre 1 Gig', quantity: 1 }],
  pricing: {
    lines: [{ sku: 'GK-FIBRE-1000', quantity: 1, monthlyNet: 7600 }],
    recurring: { tax: 475 },
    introductory: { freeMonths: 0, monthlyCredit: 0 },
  },
  ...overrides,
});

describe('billingPeriod', () => {
  test('first period runs from the activation day to the next month start', () => {
    const p = billingPeriod(new Date('2026-03-15T16:30:00Z'), new Date('2026-03-20T00:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(p).toMatchObject({ index: 0, billedDays: 17, daysInPeriod: 31 });
  });

  test('later periods are full calendar months', () => {
    const p = billingPeriod(new Date('2026-03-15T00:00:00Z'), new Date('2026-05-02T00:00:00Z'));
    expect(p).toMatchObject({ index: 2, billedDays: 31, daysInPeriod: 31 });
  });

  test('refuses dates before activation', () => {
    expect(() => billingPeriod(new Date('2026-03-15T00:00:00Z'), new Date('2026-02-01T00:00:00Z'))).toThrow(RangeError);
  });
});

test('prorate returns the full amount for a full period', () => {
  expect(prorate(7600, 31, 31)).toBe(7600);
  expect(prorate(7600, 17, 31)).toBe(4168);
});

describe('buildRecurringInvoice', () => {
  test('prorates the first period, lines and tax', () => {
    const invoice = buildRecurringInvoice(activeOrder(), new Date('2026-03-20T00:00:00Z'));
    expect(invoice.prorated).toBe(true);
    expect(invoice.lines).toEqual([{ sku: 'GK-FIBRE-1000', description: 'Fibre 1 Gig', amount: 4168 }]);
    expect(invoice).toMatchObject({ subtotal: 4168, tax: 260, total: 4428 });
  });

  test('bills a full month after the first period', () => {
    const invoice = buildRecurringInvoice(activeOrder(), new Date('2026-04-02T00:00:00Z'));
    expect(invoice).toMatchObject({ prorated: false, subtotal: 7600, tax: 475, total: 8075 });
  });

  test('credits introductory free months in full', () => {
    const order = activeOrder();
    order.pricing.introductory.freeMonths = 2;
    const second = buildRecurringInvoice(order, new Date('2026-04-02T00:00:00Z'));
    expect(second.total).toBe(0);
    expect(second.lines[1].description).toMatch(/month 2 of 2 free/);
    const third = buildRecurringInvoice(order, new Date('2026-05-02T00:00:00Z'));
    expect(third.total).toBe(8075);
  });

  test('requires an activation date', () => {
    expect(() => buildRecurringInvoice(activeOrder({ activatedAt: null }), new Date())).toThrow(RangeError);
  });
});

describe('buildInitialInvoice', () => {
  test('returns null when nothing was due at checkout', () => {
    expect(buildInitialInvoice({ ...activeOrder(), dueToday: 0, pricing: { oneTime: {} } })).toBeNull();
  });

  test('itemises equipment, installation and its waiver', () => {
    const invoice = buildInitialInvoice({
      ...activeOrder(),
      dueToday: 13706,
      pricing: { oneTime: { hardware: 12900, installation: 9900, installationWaived: 9900, promoDiscount: 0, tax: 806 } },
    });
    expect(invoice.lines.map((l) => l.amount)).toEqual([12900, 9900, -9900]);
    expect(invoice).toMatchObject({ kind: 'INITIAL', subtotal: 12900, tax: 806, total: 13706 });
  });
});

test('dueDate honours business credit terms', () => {
  const issued = new Date('2026-03-20T10:00:00Z');
  expect(dueDate(issued).toISOString()).toBe('2026-04-03T00:00:00.000Z');
  expect(dueDate(issued, { creditTermsDays: 30 }).toISOString()).toBe('2026-04-19T00:00:00.000Z');
});

test('displayStatus flags unpaid invoices past their due date', () => {
  const now = new Date('2026-05-01T00:00:00Z');
  expect(displayStatus({ status: 'ISSUED', dueAt: '2026-04-03T00:00:00Z' }, now)).toBe('OVERDUE');
  expect(displayStatus({ status: 'PAID', dueAt: '2026-04-03T00:00:00Z' }, now)).toBe('PAID');
});

test('invoice numbers embed the issue month', () => {
  expect(generateInvoiceNumber(new Date('2026-11-11T00:00:00Z'))).toMatch(/^INV-202611-[A-Z0-9]{6}$/);
});
