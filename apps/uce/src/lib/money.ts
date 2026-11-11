/** Money in integer minor units + ISO currency, per CONVENTIONS.md. */
export interface Money {
  amountMinor: number;
  currency: string;
}

export function formatMoney(money: Money, locale = 'en-GB'): string {
  if (!Number.isInteger(money.amountMinor)) throw new TypeError(`amountMinor must be an integer, got ${money.amountMinor}`);
  // Intl takes a number in major units; dividing an integer by 100 is exact for display at 2 dp.
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(money.amountMinor / 100);
}

/** Sums amounts per currency without mixing currencies or touching floats. */
export function sumByCurrency(amounts: Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const { amountMinor, currency } of amounts) totals.set(currency, (totals.get(currency) ?? 0) + amountMinor);
  return [...totals.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function formatDate(iso: string, locale = 'en-GB'): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
