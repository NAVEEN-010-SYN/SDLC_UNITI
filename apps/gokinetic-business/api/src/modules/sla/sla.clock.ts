import { MS_PER_MINUTE } from '../../lib/dates';
import { TicketSlaTarget } from './sla.policy';

export const BUSINESS_DAY_START_HOUR = 8;
export const BUSINESS_DAY_END_HOUR = 18;
const BUSINESS_MINUTES_PER_DAY = (BUSINESS_DAY_END_HOUR - BUSINESS_DAY_START_HOUR) * 60;

function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function atUtcHour(d: Date, hour: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
}

function nextDayStart(d: Date): Date {
  const next = atUtcHour(d, BUSINESS_DAY_START_HOUR);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Moves a timestamp forward to the next instant inside business hours (or returns it unchanged). */
export function alignToBusinessHours(start: Date): Date {
  let t = new Date(start.getTime());
  for (let guard = 0; guard < 14; guard++) {
    if (!isBusinessDay(t)) {
      t = nextDayStart(t);
      continue;
    }
    const open = atUtcHour(t, BUSINESS_DAY_START_HOUR);
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    if (t < open) return open;
    if (t >= close) {
      t = nextDayStart(t);
      continue;
    }
    return t;
  }
  return t;
}

/** Adds business minutes (Mon-Fri 08:00-18:00 UTC) to a start time. */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let t = alignToBusinessHours(start);
  let remaining = minutes;
  const fullDays = Math.floor(remaining / BUSINESS_MINUTES_PER_DAY);
  // Fast-forward whole business days; the loop below handles the partial remainder.
  for (let i = 0; i < fullDays; i++) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const minutesLeftToday = (close.getTime() - t.getTime()) / MS_PER_MINUTE;
    const offsetIntoDay = BUSINESS_MINUTES_PER_DAY - minutesLeftToday;
    t = alignToBusinessHours(nextDayStart(t));
    t = new Date(t.getTime() + offsetIntoDay * MS_PER_MINUTE);
    remaining -= BUSINESS_MINUTES_PER_DAY;
  }
  while (remaining > 0) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const available = (close.getTime() - t.getTime()) / MS_PER_MINUTE;
    if (remaining <= available) {
      return new Date(t.getTime() + remaining * MS_PER_MINUTE);
    }
    remaining -= available;
    t = alignToBusinessHours(nextDayStart(t));
  }
  return t;
}

/** Business minutes elapsed between two instants. */
export function businessMinutesBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  let t = alignToBusinessHours(from);
  while (t < to) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const end = close < to ? close : to;
    total += Math.max(0, (end.getTime() - t.getTime()) / MS_PER_MINUTE);
    if (close >= to) break;
    t = alignToBusinessHours(nextDayStart(t));
  }
  return Math.round(total);
}

/** Computes a due date by the policy's clock, extended by any paused (pending customer) time. */
export function dueDate(start: Date, minutes: number, clock: TicketSlaTarget['clock'], pausedMs = 0): Date {
  const shifted = new Date(start.getTime() + pausedMs);
  return clock === '24x7' ? new Date(shifted.getTime() + minutes * MS_PER_MINUTE) : addBusinessMinutes(shifted, minutes);
}

/** Minutes of the SLA clock consumed so far, excluding paused time. */
export function elapsedSlaMinutes(start: Date, now: Date, clock: TicketSlaTarget['clock'], pausedMs = 0): number {
  if (clock === '24x7') {
    return Math.max(0, Math.round((now.getTime() - start.getTime() - pausedMs) / MS_PER_MINUTE));
  }
  return Math.max(0, businessMinutesBetween(start, now) - Math.round(pausedMs / MS_PER_MINUTE));
}
