/**
 * Money helpers. Amounts stay as integer minor units end to end; conversion to a decimal
 * string happens only for display or when parsing user input, never via floating-point maths
 * on stored values.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f;
}

export function formatMoney(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Amount must be an integer number of minor units: ${amountMinor}`);
  }
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  // Format the major part via Intl for grouping/symbol, then splice the exact minor digits in.
  const parts = formatter(currency).formatToParts(major);
  const text = parts
    .map((p) => (p.type === 'fraction' ? String(minor).padStart(2, '0') : p.value))
    .join('');
  return negative ? `-${text}` : text;
}

/**
 * Parses a user-entered major-unit amount ("1,234.5", "£99") into minor units. Returns
 * undefined for anything that is not a plain non-negative amount with at most two decimals.
 */
export function parseMoneyInput(input: string): number | undefined {
  const cleaned = input.replace(/[£$€,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) {
    return undefined;
  }
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

export function minorToInput(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
