import { MoneyPipe, PaginatorComponent, StatusLabelPipe, isoDate, parseMajorToMinor } from './shared';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats minor units with the currency symbol', () => {
    expect(pipe.transform(2499, 'GBP')).toBe('£24.99');
    expect(pipe.transform(123456789, 'GBP')).toBe('£1,234,567.89');
  });

  it('keeps the sign on credits and pads pence', () => {
    expect(pipe.transform(-505, 'GBP')).toBe('-£5.05');
    expect(pipe.transform(7, 'EUR')).toBe('€0.07');
  });

  it('falls back to the ISO code for unknown currencies and dashes for missing values', () => {
    expect(pipe.transform(1000, 'SEK')).toBe('10.00 SEK');
    expect(pipe.transform(null)).toBe('—');
  });
});

describe('StatusLabelPipe', () => {
  const pipe = new StatusLabelPipe();

  it('humanises screaming snake and pascal case', () => {
    expect(pipe.transform('PENDING_CUSTOMER')).toBe('Pending customer');
    expect(pipe.transform('AtRisk')).toBe('At risk');
    expect(pipe.transform('ACTIVE')).toBe('Active');
    expect(pipe.transform(null)).toBe('');
  });
});

describe('parseMajorToMinor', () => {
  it('converts typed amounts without floating point error', () => {
    expect(parseMajorToMinor('12.5')).toBe(1250);
    expect(parseMajorToMinor('0.29')).toBe(29);
    expect(parseMajorToMinor(' 100 ')).toBe(10000);
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(parseMajorToMinor('1.234')).toBeNull();
    expect(parseMajorToMinor('-5')).toBeNull();
    expect(parseMajorToMinor('£5')).toBeNull();
  });
});

describe('isoDate', () => {
  it('offsets in UTC days across month ends', () => {
    expect(isoDate(1, new Date(Date.UTC(2024, 0, 31, 23, 30)))).toBe('2024-02-01');
  });
});

describe('PaginatorComponent', () => {
  it('always reports at least one page', () => {
    const p = new PaginatorComponent();
    p.total = 0;
    expect(p.pages).toBe(1);
    p.total = 51;
    p.pageSize = 25;
    expect(p.pages).toBe(3);
  });
});
