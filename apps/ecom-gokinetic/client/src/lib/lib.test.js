import { describe, expect, test } from 'vitest';
import { formatMoney, formatSpeed, formatCalendarDate, formatTerm, statusLabel } from './format';
import { addressSchema, normalizePhone, rules, validateValues } from './validation';
import { parseSiteList, volumeTier } from './sites';
import { cardBrand, luhnValid, validateCard } from './paymentTokenizer';

describe('format', () => {
  test.each([
    [0, '$0.00'],
    [8075, '$80.75'],
    [123456789, '$1,234,567.89'],
    [-990, '-$9.90'],
  ])('formatMoney(%i) = %s', (minor, text) => {
    expect(formatMoney(minor)).toBe(text);
  });

  test('refuses non-integer money', () => {
    expect(formatMoney(10.5)).toBe('-');
  });

  test('speeds, terms, calendar dates and statuses', () => {
    expect(formatSpeed(2000)).toBe('2 Gbps');
    expect(formatSpeed(500)).toBe('500 Mbps');
    expect(formatTerm(0)).toBe('No contract');
    expect(formatTerm(24)).toBe('24-month contract');
    expect(formatCalendarDate('2026-11-27')).toBe('Fri, Nov 27');
    expect(statusLabel('PROVISIONING')).toBe('Installation scheduled');
  });
});

describe('validation', () => {
  test('address schema reports the first failing rule per field', () => {
    const errors = validateValues(addressSchema('address'), { address: { line1: '1', city: 'Austin', state: 'XX', postalCode: '7870' } });
    expect(errors).toEqual({
      'address.line1': 'Street address must be at least 3 characters.',
      'address.state': 'Choose a state.',
      'address.postalCode': 'Enter a 5-digit ZIP code.',
    });
  });

  test('password and confirmation rules', () => {
    const schema = { password: [rules.password()], confirm: [rules.matches('password', 'Mismatch')] };
    expect(validateValues(schema, { password: 'short', confirm: 'short' })).toEqual({ password: 'Use at least 10 characters.' });
    expect(validateValues(schema, { password: 'Long-enough-1', confirm: 'other' })).toEqual({ confirm: 'Mismatch' });
  });

  test('phone numbers are normalised to 10 digits', () => {
    expect(normalizePhone('+1 (512) 555-0100')).toBe('5125550100');
    expect(rules.phone()('(512) 555-0100')).toBeNull();
  });
});

describe('parseSiteList', () => {
  test('parses CSV and TSV rows, skipping the header, duplicates and bad rows', () => {
    const text = [
      'Street,Unit,City,State,ZIP',
      '12 Main St,,Austin,TX,78701',
      '"400 Congress Ave, Floor 3",Ste 300,Austin,tx,78701',
      '12 Main St,,Austin,TX,78701',
      '9 Elm St\tDallas\tTX\t75201',
      'Nowhere Rd,Somewhere,ZZ,00000',
      'just one cell',
    ].join('\n');
    const { sites, problems } = parseSiteList(text);
    expect(sites).toHaveLength(3);
    expect(sites[1]).toEqual({ line1: '400 Congress Ave, Floor 3', line2: 'Ste 300', city: 'Austin', state: 'TX', postalCode: '78701' });
    expect(problems.map((p) => p.line)).toEqual([4, 6, 7]);
  });

  test('caps the number of sites', () => {
    const text = Array.from({ length: 5 }, (_, i) => `${i + 10} Main St,Austin,TX,78701`).join('\n');
    const { sites, problems } = parseSiteList(text, { maxSites: 3 });
    expect(sites).toHaveLength(3);
    expect(problems[0].message).toMatch(/at most 3 sites/);
  });

  test('volume tiers mirror the server', () => {
    expect(volumeTier(3)).toEqual({ discountPercent: 0, nextTier: { sitesNeeded: 2, discountPercent: 5 } });
    expect(volumeTier(12)).toEqual({ discountPercent: 10, nextTier: { sitesNeeded: 13, discountPercent: 15 } });
    expect(volumeTier(30).nextTier).toBeNull();
  });
});

describe('card checks', () => {
  test('luhn and brand detection', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true);
    expect(luhnValid('4242 4242 4242 4241')).toBe(false);
    expect(cardBrand('378282246310005')).toBe('amex');
  });

  test('validateCard checks expiry and amex CVC length', () => {
    const now = new Date('2026-11-11T00:00:00Z');
    expect(validateCard({ number: '4242424242424242', expiry: '11/26', cvc: '123', postalCode: '78701' }, now)).toEqual({});
    expect(validateCard({ number: '4242424242424242', expiry: '10/26', cvc: '123', postalCode: '78701' }, now)).toEqual({
      expiry: 'This card has expired.',
    });
    expect(validateCard({ number: '378282246310005', expiry: '01/30', cvc: '123', postalCode: '7870' }, now)).toEqual({
      cvc: 'Enter the 4-digit security code.',
      postalCode: 'Enter the billing ZIP code.',
    });
  });
});
