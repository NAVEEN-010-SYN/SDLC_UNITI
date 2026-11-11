'use strict';

const {
  federalHolidays,
  isInstallDay,
  earliestInstallDate,
  listInstallSlots,
  preferredDateProblem,
} = require('./installWindows');

const MONDAY = new Date('2026-11-23T15:00:00Z'); // Thanksgiving week
const day = (iso) => new Date(`${iso}T00:00:00Z`);

describe('federalHolidays', () => {
  test('computes floating holidays and observed dates', () => {
    const h = federalHolidays(2026);
    expect(h.has('2026-11-26')).toBe(true); // Thanksgiving, 4th Thursday
    expect(h.has('2026-07-03')).toBe(true); // July 4th falls on Saturday
    expect(h.has('2026-05-25')).toBe(true); // Memorial Day, last Monday
    expect(h.has('2026-09-07')).toBe(true); // Labor Day
  });
});

test('Sundays and holidays are not install days', () => {
  expect(isInstallDay(day('2026-11-29'))).toBe(false);
  expect(isInstallDay(day('2026-11-26'))).toBe(false);
  expect(isInstallDay(day('2026-11-28'))).toBe(true);
});

describe('earliestInstallDate', () => {
  test('counts lead time in install days, skipping holidays', () => {
    expect(earliestInstallDate({ estimatedInstallDays: 2 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(earliestInstallDate({ estimatedInstallDays: 3 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-27');
  });

  test('enforces the minimum lead and adds survey time', () => {
    expect(earliestInstallDate({ estimatedInstallDays: 0 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(
      earliestInstallDate({ estimatedInstallDays: 2, requiresSiteSurvey: true }, MONDAY).toISOString().slice(0, 10),
    ).toBe('2026-12-02');
  });
});

describe('listInstallSlots', () => {
  test('lists install days with Saturday mornings only', () => {
    const slots = listInstallSlots({ serviceable: true, estimatedInstallDays: 2 }, MONDAY, 4);
    expect(slots.map((s) => s.date)).toEqual(['2026-11-25', '2026-11-27', '2026-11-28', '2026-11-30']);
    expect(slots[0].windows.map((w) => w.id)).toEqual(['AM', 'PM']);
    expect(slots[2].windows.map((w) => w.id)).toEqual(['AM']);
    expect(slots[0].windows[0].startsAt).toBe('2026-11-25T13:00:00.000Z');
  });

  test('offers nothing for unserviceable addresses', () => {
    expect(listInstallSlots({ serviceable: false }, MONDAY)).toEqual([]);
  });
});

describe('preferredDateProblem', () => {
  const check = { serviceable: true, estimatedInstallDays: 2 };
  test.each([
    ['2026-11-24', /earliest available installation date is 2026-11-25/],
    ['2026-11-29', /Sundays or public holidays/],
    ['2027-03-01', /at most 60 days ahead/],
  ])('%s is refused', (iso, message) => {
    expect(preferredDateProblem(check, day(iso), MONDAY)).toMatch(message);
  });

  test('accepts a bookable day', () => {
    expect(preferredDateProblem(check, day('2026-11-27'), MONDAY)).toBeNull();
  });
});
