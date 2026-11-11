import type { MaintenanceWindow } from './types';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

export interface WindowOccurrence {
  windowId: string;
  start: string;
  end: string;
}

export function parseHhmm(value: string): number {
  const m = HHMM.exec(value);
  if (!m) throw new Error(`invalid time "${value}", expected HH:mm`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function validateWindow(w: Pick<MaintenanceWindow, 'daysOfWeek' | 'startTime' | 'durationMinutes' | 'blackoutDates'>): string[] {
  const errors: string[] = [];
  if (w.daysOfWeek.length === 0) errors.push('at least one day of week is required');
  if (w.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('daysOfWeek must be integers 0..6');
  if (new Set(w.daysOfWeek).size !== w.daysOfWeek.length) errors.push('daysOfWeek contains duplicates');
  try {
    parseHhmm(w.startTime);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (w.durationMinutes < 30) errors.push('windows must be at least 30 minutes');
  if (w.durationMinutes > 12 * 60) errors.push('windows may not exceed 12 hours');
  for (const d of w.blackoutDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) errors.push(`invalid blackout date "${d}"`);
  }
  return errors;
}

function utcMidnight(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Enumerates occurrences of a weekly window that overlap [fromIso, toIso). Starts the
 * scan one day early so a window that began yesterday and crosses midnight is found.
 */
export function occurrencesBetween(window: MaintenanceWindow, fromIso: string, toIso: string): WindowOccurrence[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!(to > from)) return [];
  const startMinute = parseHhmm(window.startTime);
  const durationMs = window.durationMinutes * 60_000;
  const blackout = new Set(window.blackoutDates);
  const days = new Set(window.daysOfWeek);
  const out: WindowOccurrence[] = [];

  for (let day = utcMidnight(from) - DAY_MS; day < to; day += DAY_MS) {
    if (!days.has(new Date(day).getUTCDay())) continue;
    if (blackout.has(isoDate(day))) continue;
    const start = day + startMinute * 60_000;
    const end = start + durationMs;
    if (end > from && start < to) {
      out.push({ windowId: window.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return out;
}

/** The occurrence that contains `atIso`, if the window is open at that instant. */
export function openOccurrenceAt(window: MaintenanceWindow, atIso: string): WindowOccurrence | undefined {
  const at = Date.parse(atIso);
  return occurrencesBetween(window, new Date(at - DAY_MS).toISOString(), new Date(at + 1).toISOString()).find(
    (o) => Date.parse(o.start) <= at && Date.parse(o.end) > at,
  );
}

/** First occurrence starting at or after `afterIso` within `horizonDays`. */
export function nextOccurrence(window: MaintenanceWindow, afterIso: string, horizonDays = 35): WindowOccurrence | undefined {
  const after = Date.parse(afterIso);
  return occurrencesBetween(window, afterIso, new Date(after + horizonDays * DAY_MS).toISOString()).find(
    (o) => Date.parse(o.start) >= after,
  );
}

export interface ScheduleCheck {
  ok: boolean;
  reason?: string;
  occurrence?: WindowOccurrence;
}

/**
 * A change may be scheduled at `atIso` if the instant falls inside the window and leaves
 * at least `minRemainingMinutes` before it closes (so the change and a potential rollback
 * both fit).
 */
export function checkScheduleInWindow(
  window: MaintenanceWindow,
  atIso: string,
  nowIso: string,
  minRemainingMinutes = 30,
): ScheduleCheck {
  if (Date.parse(atIso) < Date.parse(nowIso)) return { ok: false, reason: 'scheduled time is in the past' };
  const occ = openOccurrenceAt(window, atIso);
  if (!occ) {
    const next = nextOccurrence(window, atIso);
    return {
      ok: false,
      reason: next
        ? `${atIso} is outside maintenance window "${window.name}"; next opening is ${next.start}`
        : `${atIso} is outside maintenance window "${window.name}"`,
    };
  }
  const remaining = (Date.parse(occ.end) - Date.parse(atIso)) / 60_000;
  if (remaining < minRemainingMinutes) {
    return { ok: false, reason: `only ${Math.floor(remaining)} min remain in the window; at least ${minRemainingMinutes} required`, occurrence: occ };
  }
  return { ok: true, occurrence: occ };
}
