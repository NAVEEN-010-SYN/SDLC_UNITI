/** Date helpers. All timestamps on the wire are ISO-8601 UTC. */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const d = new Date(iso);
  return { now: () => new Date(d.getTime()) };
}

export function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MS_PER_MINUTE);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function addMonthsUtc(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Whole months between two dates (floor), UTC calendar based. */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

export function startOfMonthUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

export function endOfMonthUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 1));
}

/** Parse a billing period "YYYY-MM" into a [start, end) UTC range. */
export function parsePeriod(period: string): { start: Date; end: Date; year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new RangeError(`Invalid period "${period}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  return { start: startOfMonthUtc(year, month), end: endOfMonthUtc(year, month), year, month };
}

/** Length of overlap in ms between [aStart,aEnd) and [bStart,bEnd). */
export function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}
