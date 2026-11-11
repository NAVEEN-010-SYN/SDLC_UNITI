'use strict';

/**
 * Installation appointment windows offered at checkout.
 *
 * The storefront only captures a *preferred* date; the field-force system
 * books the real appointment once the order is validated (see
 * orderService.processSubmitted). These rules keep the preference realistic:
 *
 *  - the earliest date is the network lead time for the address (from the
 *    serviceability check) counted in install days, plus extra days when a
 *    site survey is required
 *  - engineers do not work Sundays or US federal holidays
 *  - Saturdays only offer a morning window
 *  - preferences more than MAX_HORIZON_DAYS out are refused (capacity plans
 *    are not published that far ahead)
 *
 * All calculations are on UTC calendar dates.
 */

const DEFAULT_LEAD_DAYS = 5;
const MIN_LEAD_DAYS = 2;
const SITE_SURVEY_EXTRA_DAYS = 5;
const MAX_HORIZON_DAYS = 60;
const DAY_MS = 24 * 3600 * 1000;

const WINDOWS = Object.freeze({
  AM: { id: 'AM', label: '8am - 12pm', startHourUtc: 13 },
  PM: { id: 'PM', label: '12pm - 5pm', startHourUtc: 17 },
});

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/** nth weekday (0=Sun) of a month, e.g. 4th Thursday of November. */
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/** Last given weekday of a month, e.g. last Monday of May. */
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

/**
 * Fixed-date holidays falling on a weekend are observed on the nearest
 * weekday (Saturday -> Friday, Sunday -> Monday).
 */
function observed(date) {
  const day = date.getUTCDay();
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map();

/** US federal holidays for a year as a Set of YYYY-MM-DD strings. */
function federalHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const dates = [
    observed(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    nthWeekday(year, 0, 1, 3), // MLK Day
    nthWeekday(year, 1, 1, 3), // Presidents' Day
    lastWeekday(year, 4, 1), // Memorial Day
    observed(new Date(Date.UTC(year, 5, 19))), // Juneteenth
    observed(new Date(Date.UTC(year, 6, 4))), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 9, 1, 2), // Columbus Day
    observed(new Date(Date.UTC(year, 10, 11))), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(new Date(Date.UTC(year, 11, 25))), // Christmas
  ];
  const set = new Set(dates.map(toDateString));
  holidayCache.set(year, set);
  return set;
}

function isInstallDay(date) {
  if (date.getUTCDay() === 0) return false;
  return !federalHolidays(date.getUTCFullYear()).has(toDateString(date));
}

function windowsFor(date) {
  return date.getUTCDay() === 6 ? [WINDOWS.AM] : [WINDOWS.AM, WINDOWS.PM];
}

/**
 * Advances `count` install days from `from` (exclusive).
 */
function addInstallDays(from, count) {
  let cursor = startOfUtcDay(from);
  let remaining = count;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isInstallDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/**
 * @param {{estimatedInstallDays?: number|null, requiresSiteSurvey?: boolean}} check
 * @param {Date} now
 * @returns {Date} earliest bookable install date (UTC midnight)
 */
function earliestInstallDate(check, now) {
  const lead = Math.max(MIN_LEAD_DAYS, check.estimatedInstallDays ?? DEFAULT_LEAD_DAYS);
  const extra = check.requiresSiteSurvey ? SITE_SURVEY_EXTRA_DAYS : 0;
  return addInstallDays(now, lead + extra);
}

/**
 * Lists the next `days` install days with their windows.
 * @returns {Array<{date: string, windows: Array<{id: string, label: string, startsAt: string}>}>}
 */
function listInstallSlots(check, now, days = 14) {
  if (!check.serviceable) return [];
  const slots = [];
  const horizon = addDays(startOfUtcDay(now), MAX_HORIZON_DAYS);
  let cursor = earliestInstallDate(check, now);
  while (slots.length < days && cursor <= horizon) {
    if (isInstallDay(cursor)) {
      slots.push({
        date: toDateString(cursor),
        windows: windowsFor(cursor).map((w) => ({
          id: w.id,
          label: w.label,
          startsAt: new Date(cursor.getTime() + w.startHourUtc * 3600000).toISOString(),
        })),
      });
    }
    cursor = addDays(cursor, 1);
  }
  return slots;
}

/**
 * Explains why a preferred date is not acceptable, or returns null.
 * @param {Date} preferred
 */
function preferredDateProblem(check, preferred, now) {
  const day = startOfUtcDay(preferred);
  const earliest = earliestInstallDate(check, now);
  if (day < earliest) {
    return `The earliest available installation date is ${toDateString(earliest)}.`;
  }
  if (day > addDays(startOfUtcDay(now), MAX_HORIZON_DAYS)) {
    return `Installations can be booked at most ${MAX_HORIZON_DAYS} days ahead.`;
  }
  if (!isInstallDay(day)) {
    return 'Installations are not available on Sundays or public holidays.';
  }
  return null;
}

module.exports = {
  WINDOWS,
  MAX_HORIZON_DAYS,
  federalHolidays,
  isInstallDay,
  earliestInstallDate,
  listInstallSlots,
  preferredDateProblem,
};
