/**
 * Money helpers. Amounts are always integer minor units (pence/cents) with an ISO-4217 currency.
 * No floating point arithmetic is used for monetary values.
 */
export type CurrencyCode = 'GBP' | 'EUR' | 'USD';

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode = 'GBP'): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Money amount must be a safe integer of minor units, received ${amountMinor}`);
  }
  return { amountMinor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(items: Money[], currency: CurrencyCode = 'GBP'): Money {
  return items.reduce((acc, m) => add(acc, m), money(0, currency));
}

/**
 * Multiply by a rational expressed in basis points (1/10,000) using banker's rounding,
 * e.g. 2000 bps = 20%.
 */
export function percentageOf(m: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints)) throw new RangeError('basisPoints must be an integer');
  return money(roundHalfEven((m.amountMinor * basisPoints) / 10_000), m.currency);
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPS = 1e-9;
  if (diff > 0.5 + EPS) return floor + 1;
  if (diff < 0.5 - EPS) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Split an amount across weights so the parts always sum exactly to the total
 * (largest-remainder method). Used for cost-centre allocation.
 */
export function allocateByWeights(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) throw new RangeError('At least one weight is required');
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new RangeError('Weights must be non-negative integers');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new RangeError('Weights must not all be zero');

  const sign = total.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(total.amountMinor);
  const raw = weights.map((w) => (abs * w) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);

  for (const { i } of order) {
    if (remainder === 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((f) => money(sign * f, total.currency));
}

export function formatMoney(m: Money, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.amountMinor / 100);
}
