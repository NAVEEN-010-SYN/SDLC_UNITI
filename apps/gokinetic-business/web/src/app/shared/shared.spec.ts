import { FormControl, FormGroup } from '@angular/forms';
import { ApiProblem } from '../core/http/api-problem';
import { applyProblemToForm } from './form-errors';
import { MoneyPipe, PercentPipe, formatMinor } from './money.pipe';
import { humanise, toneFor } from './status-badge.component';
import { cardNotExpired, errorMessage, leadTimeDate, moneyAmount, parseMoneyToMinor, sortCode, ukPostcode } from './validators';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats minor units as GBP', () => {
    expect(pipe.transform(123456)).toBe('£1,234.56');
    expect(pipe.transform(5)).toBe('£0.05');
  });

  it('respects currencies without minor units', () => {
    expect(formatMinor(1500, 'JPY')).toBe('JP¥1,500');
  });

  it('shows signs for deltas when requested', () => {
    expect(pipe.transform(2000, 'GBP', true)).toBe('+£20.00');
    expect(pipe.transform(-2000, 'GBP', true)).toBe('-£20.00');
    expect(pipe.transform(0, 'GBP', true)).toBe('£0.00');
  });

  it('renders a dash for missing amounts', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });
});

describe('PercentPipe', () => {
  const pipe = new PercentPipe();
  it('formats milli-percent and basis points', () => {
    expect(pipe.transform(99_950)).toBe('99.950%');
    expect(pipe.transform(7_500, 'bps')).toBe('75.00%');
    expect(pipe.transform(null)).toBe('—');
  });
});

describe('status badge helpers', () => {
  it('maps statuses to tones', () => {
    expect(toneFor('ACTIVE')).toBe('success');
    expect(toneFor('OVERDUE')).toBe('danger');
    expect(toneFor('PENDING_CUSTOMER')).toBe('warning');
    expect(toneFor('SOMETHING_NEW')).toBe('neutral');
  });

  it('humanises enum values', () => {
    expect(humanise('PENDING_CUSTOMER')).toBe('Pending customer');
  });
});

describe('validators', () => {
  it('validates UK postcodes', () => {
    expect(ukPostcode()(new FormControl('EC1A 1BB'))).toBeNull();
    expect(ukPostcode()(new FormControl('ec1a1bb'))).toBeNull();
    expect(ukPostcode()(new FormControl('12345'))).toEqual({ postcode: true });
    expect(ukPostcode()(new FormControl(''))).toBeNull();
  });

  it('accepts formatted sort codes', () => {
    expect(sortCode()(new FormControl('12-34-56'))).toBeNull();
    expect(sortCode()(new FormControl('12-34-5'))).toEqual({ sortCode: true });
  });

  it('parses money without floating point error', () => {
    expect(parseMoneyToMinor('1,234.5')).toBe(123450);
    expect(parseMoneyToMinor('£0.07')).toBe(7);
    expect(parseMoneyToMinor('19.999')).toBeNull();
    expect(parseMoneyToMinor('-5')).toBeNull();
    expect(moneyAmount(1000)(new FormControl('10.01'))).toEqual({ moneyMax: { max: 1000 } });
  });

  describe('leadTimeDate', () => {
    const today = () => new Date('2024-06-03T10:00:00Z'); // Monday
    const validator = leadTimeDate({ minLeadDays: 10, maxLeadDays: 180, weekdaysOnly: true, today });

    it('enforces the minimum lead time', () => {
      expect(validator(new FormControl('2024-06-12'))).toEqual({ leadTooShort: { min: 10 } });
      expect(validator(new FormControl('2024-06-13'))).toBeNull();
    });

    it('rejects weekends and dates too far ahead', () => {
      expect(validator(new FormControl('2024-06-15'))).toEqual({ weekend: true });
      expect(validator(new FormControl('2025-01-31'))).toEqual({ leadTooLong: { max: 180 } });
    });

    it('rejects malformed dates', () => {
      expect(validator(new FormControl('13/06/2024'))).toEqual({ date: true });
    });
  });

  it('treats a card as valid through its expiry month', () => {
    const today = () => new Date('2024-06-15T00:00:00Z');
    const group = (m: number, y: number) => new FormGroup({ expiryMonth: new FormControl(m), expiryYear: new FormControl(y) });
    expect(cardNotExpired('expiryMonth', 'expiryYear', today)(group(6, 2024))).toBeNull();
    expect(cardNotExpired('expiryMonth', 'expiryYear', today)(group(5, 2024))).toEqual({ cardExpired: true });
  });

  it('produces readable messages', () => {
    expect(errorMessage({ required: true })).toBe('This field is required');
    expect(errorMessage({ leadTooShort: { min: 10 } })).toBe('Choose a date at least 10 days from today');
    expect(errorMessage({ server: { message: 'Already taken' } })).toBe('Already taken');
    expect(errorMessage(null)).toBeNull();
  });
});

describe('applyProblemToForm', () => {
  it('maps body.* field errors onto controls and returns the rest', () => {
    const form = new FormGroup({ email: new FormControl('x') });
    const problem = new ApiProblem(400, 'Invalid request', '', 'validation-error', [
      { field: 'body.email', message: 'Invalid email' },
      { field: 'body.unknown', message: 'Nope' }
    ]);
    const unmatched = applyProblemToForm(form, problem);
    expect(form.controls.email.errors).toEqual({ server: { message: 'Invalid email' } });
    expect(form.controls.email.touched).toBeTrue();
    expect(unmatched).toEqual(['unknown: Nope']);
  });
});
