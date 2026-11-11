'use strict';

const m = require('./money');

describe('money', () => {
  test('rejects non-integer amounts and unsupported currencies', () => {
    expect(() => m.money(10.5)).toThrow(TypeError);
    expect(() => m.money(100, 'EUR')).toThrow(RangeError);
  });

  test('refuses to mix currencies', () => {
    expect(() => m.add({ amount: 1, currency: 'USD' }, { amount: 1, currency: 'GBP' })).toThrow('Currency mismatch');
  });

  test('sum adds a list of amounts', () => {
    expect(m.sum([m.money(150), m.money(250), m.money(-100)])).toEqual({ amount: 300, currency: 'USD' });
  });

  test.each([
    [5, 2, 2], // 2.5 -> 2 (even)
    [7, 2, 4], // 3.5 -> 4 (even)
    [-5, 2, -2],
    [10, 3, 3],
    [20, 3, 7],
  ])('divideRoundHalfEven(%i, %i) = %i', (num, den, expected) => {
    expect(m.divideRoundHalfEven(num, den)).toBe(expected);
  });

  test('applyBps rounds half-even on the exact rational', () => {
    // 1050 * 8.25% = 86.625 -> 87
    expect(m.applyBps(m.money(1050), 825).amount).toBe(87);
    // 200 * 0.25% = 0.5 -> 0 (even)
    expect(m.applyBps(m.money(200), 25).amount).toBe(0);
  });

  test('allocate always sums to the total and favours larger remainders', () => {
    expect(m.allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(m.allocate(10, [0, 0])).toEqual([10, 0]);
    const parts = m.allocate(997, [3, 5, 11, 2]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(997);
  });

  test('format renders dollars for humans only', () => {
    expect(m.format(m.money(123456))).toBe('$1,234.56');
  });
});
