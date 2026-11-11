import { addBusinessMinutes, alignToBusinessHours, businessMinutesBetween, dueDate, elapsedSlaMinutes } from './sla.clock';

const at = (iso: string) => new Date(iso);

describe('alignToBusinessHours', () => {
  it('keeps an instant already inside business hours', () => {
    expect(alignToBusinessHours(at('2024-06-04T10:15:00Z')).toISOString()).toBe('2024-06-04T10:15:00.000Z');
  });

  it('moves early-morning instants to opening time', () => {
    expect(alignToBusinessHours(at('2024-06-04T06:00:00Z')).toISOString()).toBe('2024-06-04T08:00:00.000Z');
  });

  it('moves evening and weekend instants to Monday opening', () => {
    expect(alignToBusinessHours(at('2024-06-07T19:00:00Z')).toISOString()).toBe('2024-06-10T08:00:00.000Z');
    expect(alignToBusinessHours(at('2024-06-09T12:00:00Z')).toISOString()).toBe('2024-06-10T08:00:00.000Z');
  });
});

describe('addBusinessMinutes', () => {
  it('stays within the same day when time allows', () => {
    expect(addBusinessMinutes(at('2024-06-04T09:00:00Z'), 120).toISOString()).toBe('2024-06-04T11:00:00.000Z');
  });

  it('carries the remainder into the next business day', () => {
    expect(addBusinessMinutes(at('2024-06-04T17:00:00Z'), 120).toISOString()).toBe('2024-06-05T09:00:00.000Z');
  });

  it('fast-forwards whole business days across a weekend', () => {
    // Thursday 12:00 + 20 business hours => Monday 12:00
    expect(addBusinessMinutes(at('2024-06-06T12:00:00Z'), 20 * 60).toISOString()).toBe('2024-06-10T12:00:00.000Z');
  });
});

describe('businessMinutesBetween', () => {
  it('counts only business minutes', () => {
    expect(businessMinutesBetween(at('2024-06-07T17:00:00Z'), at('2024-06-10T09:00:00Z'))).toBe(120);
  });

  it('is zero for reversed ranges', () => {
    expect(businessMinutesBetween(at('2024-06-10T09:00:00Z'), at('2024-06-07T17:00:00Z'))).toBe(0);
  });

  it('is the inverse of addBusinessMinutes', () => {
    const start = at('2024-06-05T15:20:00Z');
    expect(businessMinutesBetween(start, addBusinessMinutes(start, 1_234))).toBe(1_234);
  });
});

describe('dueDate / elapsedSlaMinutes', () => {
  it('adds wall-clock minutes for 24x7 targets', () => {
    expect(dueDate(at('2024-06-08T23:30:00Z'), 60, '24x7').toISOString()).toBe('2024-06-09T00:30:00.000Z');
  });

  it('shifts due dates by paused time', () => {
    expect(dueDate(at('2024-06-04T09:00:00Z'), 60, '24x7', 30 * 60_000).toISOString()).toBe('2024-06-04T10:30:00.000Z');
  });

  it('subtracts paused time from elapsed minutes', () => {
    expect(elapsedSlaMinutes(at('2024-06-04T09:00:00Z'), at('2024-06-04T12:00:00Z'), '24x7', 60 * 60_000)).toBe(120);
    expect(elapsedSlaMinutes(at('2024-06-04T09:00:00Z'), at('2024-06-04T12:00:00Z'), 'BUSINESS_HOURS', 60 * 60_000)).toBe(120);
  });
});
