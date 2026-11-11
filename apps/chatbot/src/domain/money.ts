import { Money } from './types';

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

/** Formats integer minor units without ever going through floating point arithmetic. */
export function formatMoney(money: Money): string {
  if (!Number.isInteger(money.amountMinor)) {
    throw new TypeError(`amountMinor must be an integer, got ${money.amountMinor}`);
  }
  const negative = money.amountMinor < 0;
  const abs = Math.abs(money.amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const groupedMajor = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = CURRENCY_SYMBOLS[money.currency] ?? `${money.currency} `;
  return `${negative ? '-' : ''}${symbol}${groupedMajor}.${minor.toString().padStart(2, '0')}`;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  return addMoney(a, { amountMinor: -b.amountMinor, currency: b.currency });
}

/** Signed monthly difference between two plan prices, used in upgrade quotes. */
export function priceDelta(current: Money, target: Money): Money {
  return subtractMoney(target, current);
}
