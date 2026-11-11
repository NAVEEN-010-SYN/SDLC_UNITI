'use strict';

const { divideRoundHalfEven, allocate } = require('./money');
const { randomCode } = require('./identifiers');

/**
 * Invoice construction for storefront orders.
 *
 * Two kinds of invoice are produced:
 *  - INITIAL:   the one-off charges taken at checkout (hardware, installation,
 *               one-time promo discounts and their tax). Amounts come straight
 *               from the order's pricing snapshot so the invoice always equals
 *               what was authorised.
 *  - RECURRING: calendar-month service charges. Billing runs on the 1st of each
 *               month; the first period is prorated from the activation date.
 *               Introductory free months (FREE_MONTHS promos) are credited in
 *               full on the first N periods.
 *
 * Pure functions only; amounts are integer minor units.
 */

const INVOICE_KINDS = Object.freeze({ INITIAL: 'INITIAL', RECURRING: 'RECURRING' });
const INVOICE_STATUS = Object.freeze({ ISSUED: 'ISSUED', PAID: 'PAID', VOID: 'VOID' });

const DAY_MS = 24 * 3600 * 1000;

/** @returns {string} e.g. INV-202611-7HQ2XK */
function generateInvoiceNumber(date) {
  const yyyymm = date.toISOString().slice(0, 7).replace('-', '');
  return `INV-${yyyymm}-${randomCode(6)}`;
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Number of whole calendar months between the activation month and the
 * month containing `asOf` (0 for the activation month itself).
 */
function periodIndex(activatedAt, asOf) {
  return (
    (asOf.getUTCFullYear() - activatedAt.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - activatedAt.getUTCMonth())
  );
}

/**
 * The billing period containing `asOf` for a service activated at
 * `activatedAt`. The first period starts on the activation day.
 * @returns {{start: Date, end: Date, index: number, billedDays: number, daysInPeriod: number}}
 *   `end` is exclusive.
 */
function billingPeriod(activatedAt, asOf) {
  const activation = startOfUtcDay(activatedAt);
  const index = periodIndex(activation, asOf);
  if (index < 0) throw new RangeError('asOf is before the activation date');
  const fullStart = monthStart(asOf);
  const end = nextMonthStart(asOf);
  const start = index === 0 ? activation : fullStart;
  return {
    start,
    end,
    index,
    billedDays: daysBetween(start, end),
    daysInPeriod: daysBetween(fullStart, end),
  };
}

/** Prorates a monthly amount for a partial period, rounding half-even. */
function prorate(amount, billedDays, daysInPeriod) {
  if (billedDays >= daysInPeriod) return amount;
  return divideRoundHalfEven(amount * billedDays, daysInPeriod);
}

function nameBySku(order) {
  return new Map((order.items || []).map((i) => [i.sku, i.name]));
}

function totals(lines, tax) {
  const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
  return { subtotal, tax, total: subtotal + tax };
}

/**
 * Builds the INITIAL invoice body (without number/status) from an order.
 * Returns null when nothing was due at checkout.
 */
function buildInitialInvoice(order) {
  const oneTime = order.pricing && order.pricing.oneTime;
  if (!oneTime || order.dueToday <= 0) return null;
  const lines = [];
  if (oneTime.hardware > 0) lines.push({ description: 'Equipment', amount: oneTime.hardware });
  if (oneTime.installation > 0) lines.push({ description: 'Installation', amount: oneTime.installation });
  if (oneTime.installationWaived > 0) {
    lines.push({ description: 'Installation waived (contract term)', amount: -oneTime.installationWaived });
  }
  if (oneTime.promoDiscount > 0) {
    lines.push({ description: `Promotion ${order.promoCode || ''}`.trim(), amount: -oneTime.promoDiscount });
  }
  return {
    kind: INVOICE_KINDS.INITIAL,
    accountId: order.accountId,
    orderNumber: order.orderNumber,
    currency: order.currency || 'USD',
    periodStart: null,
    periodEnd: null,
    lines,
    ...totals(lines, oneTime.tax),
  };
}

/**
 * Builds a RECURRING invoice body for the period containing `asOf`.
 * @param {object} order ACTIVE order with pricing snapshot and activatedAt
 * @param {Date} asOf
 */
function buildRecurringInvoice(order, asOf) {
  if (!order.activatedAt) throw new RangeError(`Order ${order.orderNumber} has no activation date`);
  const pricing = order.pricing;
  const period = billingPeriod(new Date(order.activatedAt), asOf);
  const names = nameBySku(order);

  const recurringLines = pricing.lines.filter((l) => l.monthlyNet > 0);
  const fullAmounts = recurringLines.map((l) => l.monthlyNet);
  const fullSubtotal = fullAmounts.reduce((a, b) => a + b, 0);
  // Prorate the subtotal once and spread it, so lines always add up exactly.
  const proratedSubtotal = prorate(fullSubtotal, period.billedDays, period.daysInPeriod);
  const lineAmounts = allocate(proratedSubtotal, fullAmounts);
  const lines = recurringLines.map((l, i) => ({
    sku: l.sku,
    description: `${names.get(l.sku) || l.sku}${l.quantity > 1 ? ` x${l.quantity}` : ''}`,
    amount: lineAmounts[i],
  }));
  let tax = prorate(pricing.recurring.tax, period.billedDays, period.daysInPeriod);

  const freeMonths = (pricing.introductory && pricing.introductory.freeMonths) || 0;
  if (period.index < freeMonths && proratedSubtotal > 0) {
    lines.push({
      description: `Introductory offer - month ${period.index + 1} of ${freeMonths} free`,
      amount: -proratedSubtotal,
    });
    tax = 0;
  }

  return {
    kind: INVOICE_KINDS.RECURRING,
    accountId: order.accountId,
    orderNumber: order.orderNumber,
    currency: order.currency || 'USD',
    periodStart: period.start,
    periodEnd: period.end,
    prorated: period.billedDays < period.daysInPeriod,
    lines,
    ...totals(lines, tax),
  };
}

/**
 * Payment due date: business accounts on credit terms get their terms,
 * everyone else the consumer default.
 */
function dueDate(issuedAt, { creditTermsDays = 0, consumerDueDays = 14 } = {}) {
  const days = creditTermsDays > 0 ? creditTermsDays : consumerDueDays;
  return new Date(startOfUtcDay(issuedAt).getTime() + days * DAY_MS);
}

/** Derived status shown to customers: an unpaid invoice past due is OVERDUE. */
function displayStatus(invoice, now) {
  if (invoice.status === INVOICE_STATUS.ISSUED && invoice.dueAt && new Date(invoice.dueAt) < now) {
    return 'OVERDUE';
  }
  return invoice.status;
}

module.exports = {
  INVOICE_KINDS,
  INVOICE_STATUS,
  generateInvoiceNumber,
  billingPeriod,
  prorate,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
};
