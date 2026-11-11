import { CurrencyCode, Money, money, percentageOf } from '../../lib/money';
import { MS_PER_MINUTE } from '../../lib/dates';
import { Service } from '../inventory/inventory.types';
import { AvailabilityPolicy, availabilityPolicy } from './sla.policy';

export interface OutageWindow {
  serviceId: string;
  startedAt: Date;
  /** `null` while the outage is ongoing. */
  endedAt: Date | null;
  planned: boolean;
}

export interface Interval {
  start: number;
  end: number;
}

export interface ServiceAvailability {
  serviceId: string;
  productName: string;
  siteId: string;
  slaTier: Service['slaTier'];
  measuredMinutes: number;
  downtimeMinutes: number;
  plannedMinutes: number;
  outageCount: number;
  availabilityMilliPct: number;
  targetMilliPct: number;
  met: boolean;
  creditBps: number;
  credit: Money;
}

/** Merges overlapping or touching intervals so concurrent outages are not double counted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) last.end = Math.max(last.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
}

function clip(outage: OutageWindow, window: Interval, now: Date): Interval {
  const end = (outage.endedAt ?? now).getTime();
  return { start: Math.max(outage.startedAt.getTime(), window.start), end: Math.min(end, window.end) };
}

function totalMs(intervals: Interval[]): number {
  return intervals.reduce((acc, i) => acc + (i.end - i.start), 0);
}

/**
 * The part of the reporting period during which the service was billable. A service
 * activated mid-month is measured only from activation; a ceased service only until cessation.
 */
export function measurementWindow(service: Pick<Service, 'activatedAt' | 'ceasedAt'>, periodStart: Date, periodEnd: Date, now: Date): Interval | null {
  const activated = service.activatedAt ? new Date(service.activatedAt).getTime() : null;
  if (activated === null) return null;
  const ceased = service.ceasedAt ? new Date(service.ceasedAt).getTime() : Infinity;
  const start = Math.max(periodStart.getTime(), activated);
  const end = Math.min(periodEnd.getTime(), ceased, now.getTime());
  return end > start ? { start, end } : null;
}

/** Availability in thousandths of a percent, floored so we never over-report. */
export function availabilityMilliPct(measuredMs: number, downtimeMs: number): number {
  if (measuredMs <= 0) return 100_000;
  const upMs = Math.max(0, measuredMs - downtimeMs);
  return Math.floor((upMs * 100_000) / measuredMs);
}

/** The highest credit band whose threshold the availability falls below, capped by policy. */
export function creditBpsFor(policy: AvailabilityPolicy, milliPct: number): number {
  const applicable = policy.creditBands.filter((band) => milliPct < band.belowMilliPct).map((band) => band.creditBps);
  return Math.min(policy.maxCreditBps, applicable.length ? Math.max(...applicable) : 0);
}

export function serviceAvailability(
  service: Service,
  outages: OutageWindow[],
  periodStart: Date,
  periodEnd: Date,
  now: Date
): ServiceAvailability | null {
  const window = measurementWindow(service, periodStart, periodEnd, now);
  if (!window) return null;
  const own = outages.filter((o) => o.serviceId === service.id);
  const unplanned = mergeIntervals(own.filter((o) => !o.planned).map((o) => clip(o, window, now)));
  const planned = mergeIntervals(own.filter((o) => o.planned).map((o) => clip(o, window, now)));
  const measuredMs = window.end - window.start;
  const downtimeMs = totalMs(unplanned);
  const policy = availabilityPolicy(service.slaTier);
  const milliPct = availabilityMilliPct(measuredMs, downtimeMs);
  const creditBps = creditBpsFor(policy, milliPct);

  return {
    serviceId: service.id,
    productName: service.productName,
    siteId: service.siteId,
    slaTier: service.slaTier,
    measuredMinutes: Math.round(measuredMs / MS_PER_MINUTE),
    downtimeMinutes: Math.round(downtimeMs / MS_PER_MINUTE),
    plannedMinutes: Math.round(totalMs(planned) / MS_PER_MINUTE),
    outageCount: unplanned.length,
    availabilityMilliPct: milliPct,
    targetMilliPct: policy.targetMilliPct,
    met: milliPct >= policy.targetMilliPct,
    creditBps,
    credit: percentageOf(money(service.monthlyChargeMinor, service.currency as CurrencyCode), creditBps)
  };
}
