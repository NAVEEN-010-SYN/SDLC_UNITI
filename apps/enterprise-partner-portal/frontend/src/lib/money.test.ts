import { describe, expect, it } from 'vitest';
import { formatBps, formatMoney, minorToInput, parseMoneyInput } from './money';

describe('formatMoney', () => {
  it('formats minor units exactly with grouping and symbol', () => {
    expect(formatMoney(123456789, 'GBP')).toBe('£1,234,567.89');
    expect(formatMoney(5, 'GBP')).toBe('£0.05');
    expect(formatMoney(-2500, 'GBP')).toBe('-£25.00');
  });

  it('never drifts on amounts that are inexact in binary floating point', () => {
    expect(formatMoney(1010, 'GBP')).toBe('£10.10');
    expect(formatMoney(29, 'EUR')).toBe('€0.29');
  });

  it('rejects fractional minor units', () => {
    expect(() => formatMoney(10.5, 'GBP')).toThrow(RangeError);
  });
});

describe('parseMoneyInput', () => {
  it.each([
    ['1250', 125000],
    ['1,250.5', 125050],
    ['£99.99', 9999],
    [' 0.07 ', 7],
  ])('parses %s', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1.2.3'])('rejects %s', (input) => {
    expect(parseMoneyInput(input)).toBeUndefined();
  });

  it('round-trips with minorToInput', () => {
    expect(parseMoneyInput(minorToInput(1234505))).toBe(1234505);
  });
});

it('formats basis points as a percentage', () => {
  expect(formatBps(1250)).toBe('12.50%');
});
