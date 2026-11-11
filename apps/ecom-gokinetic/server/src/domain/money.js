'use strict';

/**
 * Integer minor-unit money helpers. Amounts are always integers (cents) paired
 * with an ISO-4217 currency code. Never use floating point for money.
 */

const SUPPORTED_CURRENCIES = new Set(['USD']);

function assertInteger(amount, label = 'amount') {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(`${label} must be a safe integer in minor units, got ${amount}`);
  }
}

/**
 * @param {number} amount integer minor units
 * @param {string} currency ISO-4217 code
 * @returns {{amount: number, currency: string}}
 */
function money(amount, currency = 'USD') {
  assertInteger(amount);
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new RangeError(`Unsupported currency ${currency}`);
  }
  return { amount, currency };
}

function zero(currency = 'USD') {
  return money(0, currency);
}

function assertSameCurrency(a, b) {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

function add(a, b) {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

function subtract(a, b) {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

function sum(list, currency = 'USD') {
  return list.reduce((acc, item) => add(acc, item), zero(currency));
}

/**
 * Banker's rounding (round half to even) of a rational number num/den.
 * Using integer arithmetic keeps results exact for all safe integers.
 * @param {number} num
 * @param {number} den positive
 */
function divideRoundHalfEven(num, den) {
  if (den <= 0) throw new RangeError('Denominator must be positive');
  const sign = num < 0 ? -1 : 1;
  const absNum = Math.abs(num);
  const quotient = Math.floor(absNum / den);
  const remainder = absNum - quotient * den;
  const twice = remainder * 2;
  let rounded = quotient;
  if (twice > den || (twice === den && quotient % 2 === 1)) rounded += 1;
  return sign * rounded;
}

/**
 * Multiply by an integer quantity.
 */
function multiply(m, quantity) {
  assertInteger(quantity, 'quantity');
  return money(m.amount * quantity, m.currency);
}

/**
 * Applies a rate expressed in basis points (1 bp = 0.01 %), rounding half-even.
 * @param {{amount:number,currency:string}} m
 * @param {number} bps e.g. 825 for 8.25 %
 */
function applyBps(m, bps) {
  assertInteger(bps, 'bps');
  return money(divideRoundHalfEven(m.amount * bps, 10000), m.currency);
}

/**
 * Splits `total` across weights proportionally so the parts always sum to the
 * total exactly (largest remainder method). Used to spread order-level
 * discounts across lines for per-line tax computation.
 * @param {number} total integer minor units
 * @param {number[]} weights non-negative integers
 * @returns {number[]}
 */
function allocate(total, weights) {
  assertInteger(total, 'total');
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (weightSum === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, index) => ({ index, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }
  return floors;
}

function max(a, b) {
  assertSameCurrency(a, b);
  return a.amount >= b.amount ? a : b;
}

function min(a, b) {
  assertSameCurrency(a, b);
  return a.amount <= b.amount ? a : b;
}

function isZero(m) {
  return m.amount === 0;
}

function isNegative(m) {
  return m.amount < 0;
}

/**
 * Formats for logs/emails only; the API always returns minor units.
 */
function format(m, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(
    m.amount / 100,
  );
}

module.exports = {
  money,
  zero,
  add,
  subtract,
  sum,
  multiply,
  applyBps,
  allocate,
  divideRoundHalfEven,
  max,
  min,
  isZero,
  isNegative,
  format,
  SUPPORTED_CURRENCIES,
};
