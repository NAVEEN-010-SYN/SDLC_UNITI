import { Pipe, PipeTransform } from '@angular/core';

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string, signed: boolean): Intl.NumberFormat {
  const key = `${locale}|${currency}|${signed}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency, signDisplay: signed ? 'exceptZero' : 'auto' });
    formatters.set(key, fmt);
  }
  return fmt;
}

/** Number of minor-unit digits for a currency (2 for GBP, 0 for JPY), per Intl data. */
export function minorDigits(currency: string): number {
  return formatterFor(currency, 'en-GB', false).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * Formats integer minor units without floating-point accumulation: the only division happens
 * once, at display time, on an exact integer.
 */
export function formatMinor(amountMinor: number | null | undefined, currency = 'GBP', options: { signed?: boolean; locale?: string } = {}): string {
  if (amountMinor === null || amountMinor === undefined || !Number.isFinite(amountMinor)) return '\u2014';
  const digits = minorDigits(currency);
  return formatterFor(currency, options.locale ?? 'en-GB', options.signed ?? false).format(amountMinor / 10 ** digits);
}

/** `{{ invoice.totalMinor | money: invoice.currency }}`; pass `true` as the second arg for +/- deltas. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(amountMinor: number | null | undefined, currency = 'GBP', signed = false): string {
    return formatMinor(amountMinor, currency, { signed });
  }
}

/** Thousandths of a percent (99_950) -> "99.950%"; basis points use `'bps'` (2_500 -> "25.00%"). */
@Pipe({ name: 'pct', standalone: true })
export class PercentPipe implements PipeTransform {
  transform(value: number | null | undefined, unit: 'milli' | 'bps' = 'milli'): string {
    if (value === null || value === undefined) return '\u2014';
    return unit === 'milli' ? `${(value / 1000).toFixed(3)}%` : `${(value / 100).toFixed(2)}%`;
  }
}
