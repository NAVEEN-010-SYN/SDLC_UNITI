import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const UK_POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]|[A-HK-Y][0-9][0-9]|[0-9][A-HJKS-UW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

export function ukPostcode(): ValidatorFn {
  return (c) => (isEmpty(c.value) || UK_POSTCODE.test(String(c.value).trim()) ? null : { postcode: true });
}

export function sortCode(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\d{6}$/.test(String(c.value).replace(/[\s-]/g, '')) ? null : { sortCode: true });
}

export function bankAccountNumber(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\d{8}$/.test(String(c.value).replace(/\s/g, '')) ? null : { accountNumber: true });
}

export function phoneNumber(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\+?[0-9 ()-]{7,20}$/.test(String(c.value).trim()) ? null : { phone: true });
}

/**
 * Parses a user-entered amount ("1,234.5", "GBP 12") into integer minor units without floating
 * point. Returns null for anything that is not a non-negative amount with at most `digits` decimals.
 */
export function parseMoneyToMinor(input: string, digits = 2): number | null {
  const cleaned = input.trim().replace(/^\u00A3/, '').replace(/,/g, '');
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{0,${digits}}))?$`).exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function moneyAmount(max?: number): ValidatorFn {
  return (c) => {
    if (isEmpty(c.value)) return null;
    const minor = parseMoneyToMinor(String(c.value));
    if (minor === null) return { money: true };
    return max !== undefined && minor > max ? { moneyMax: { max } } : null;
  };
}

function utcDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A YYYY-MM-DD date at least `minLeadDays` and at most `maxLeadDays` ahead of today, optionally on
 * a weekday. Mirrors the API's order-planner rules so users see problems before submitting.
 */
export function leadTimeDate(opts: { minLeadDays: number; maxLeadDays: number; weekdaysOnly?: boolean; today?: () => Date }): ValidatorFn {
  return (c) => {
    if (isEmpty(c.value)) return null;
    const date = utcDate(String(c.value));
    if (!date) return { date: true };
    const now = (opts.today ?? (() => new Date()))();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const lead = Math.round((date.getTime() - today) / 86_400_000);
    if (lead < opts.minLeadDays) return { leadTooShort: { min: opts.minLeadDays } };
    if (lead > opts.maxLeadDays) return { leadTooLong: { max: opts.maxLeadDays } };
    const day = date.getUTCDay();
    if (opts.weekdaysOnly && (day === 0 || day === 6)) return { weekend: true };
    return null;
  };
}

/** Group validator for card expiry fields: the card is valid through the end of its expiry month. */
export function cardNotExpired(monthKey = 'expiryMonth', yearKey = 'expiryYear', today: () => Date = () => new Date()): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const month = Number(group.get(monthKey)?.value);
    const year = Number(group.get(yearKey)?.value);
    if (!month || !year) return null;
    return Date.UTC(year, month, 1) <= today().getTime() ? { cardExpired: true } : null;
  };
}

const MESSAGES: Record<string, (arg: Record<string, unknown>) => string> = {
  required: () => 'This field is required',
  email: () => 'Enter a valid email address',
  minlength: (e) => `Must be at least ${e['requiredLength']} characters`,
  maxlength: (e) => `Must be at most ${e['requiredLength']} characters`,
  postcode: () => 'Enter a valid UK postcode',
  sortCode: () => 'Sort code must be 6 digits',
  accountNumber: () => 'Account number must be 8 digits',
  phone: () => 'Enter a valid phone number',
  money: () => 'Enter an amount such as 1250.00',
  moneyMax: () => 'Amount is too large',
  date: () => 'Enter a valid date',
  leadTooShort: (e) => `Choose a date at least ${e['min']} days from today`,
  leadTooLong: (e) => `Choose a date within ${e['max']} days`,
  weekend: () => 'Choose a weekday',
  cardExpired: () => 'This card has expired',
  server: (e) => String(e['message'] ?? 'Invalid value')
};

/** First human-readable error for a control, for templates. */
export function errorMessage(errors: ValidationErrors | null | undefined): string | null {
  if (!errors) return null;
  const [key, value] = Object.entries(errors)[0];
  const describe = MESSAGES[key];
  return describe ? describe(typeof value === 'object' && value ? (value as Record<string, unknown>) : {}) : 'Invalid value';
}
