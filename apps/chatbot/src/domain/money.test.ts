import { addMoney, formatMoney, priceDelta } from './money';

describe('money', () => {
  it('formats minor units with grouping and padding', () => {
    expect(formatMoney({ amountMinor: 123456789, currency: 'GBP' })).toBe('£1,234,567.89');
    expect(formatMoney({ amountMinor: 5, currency: 'GBP' })).toBe('£0.05');
    expect(formatMoney({ amountMinor: -2500, currency: 'USD' })).toBe('-$25.00');
  });

  it('falls back to currency code for unknown symbols', () => {
    expect(formatMoney({ amountMinor: 1000, currency: 'NZD' })).toBe('NZD 10.00');
  });

  it('rejects non-integer amounts', () => {
    expect(() => formatMoney({ amountMinor: 10.5, currency: 'GBP' })).toThrow(TypeError);
  });

  it('adds amounts of the same currency and rejects mismatches', () => {
    expect(addMoney({ amountMinor: 100, currency: 'GBP' }, { amountMinor: 250, currency: 'GBP' })).toEqual({
      amountMinor: 350,
      currency: 'GBP',
    });
    expect(() => addMoney({ amountMinor: 1, currency: 'GBP' }, { amountMinor: 1, currency: 'EUR' })).toThrow();
  });

  it('computes signed price deltas', () => {
    expect(priceDelta({ amountMinor: 3500, currency: 'GBP' }, { amountMinor: 4999, currency: 'GBP' }).amountMinor).toBe(1499);
    expect(priceDelta({ amountMinor: 4999, currency: 'GBP' }, { amountMinor: 3500, currency: 'GBP' }).amountMinor).toBe(-1499);
  });
});
