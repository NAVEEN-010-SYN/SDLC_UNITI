import { makeService } from '../../test/fixtures';
import { availabilityPolicy } from './sla.policy';
import {
  OutageWindow,
  availabilityMilliPct,
  creditBpsFor,
  measurementWindow,
  mergeIntervals,
  serviceAvailability
} from './sla.availability';

const JUNE_START = new Date('2024-06-01T00:00:00Z');
const JULY_START = new Date('2024-07-01T00:00:00Z');
const AFTER_JUNE = new Date('2024-07-05T00:00:00Z');
const SERVICE_ID = makeService().id;

function outage(start: string, end: string | null, planned = false): OutageWindow {
  return { serviceId: SERVICE_ID, startedAt: new Date(start), endedAt: end ? new Date(end) : null, planned };
}

describe('mergeIntervals', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 0, end: 5 },
        { start: 15, end: 30 },
        { start: 30, end: 35 }
      ])
    ).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 35 }
    ]);
  });

  it('drops empty intervals', () => {
    expect(mergeIntervals([{ start: 5, end: 5 }])).toEqual([]);
  });
});

describe('measurementWindow', () => {
  it('starts at activation for services activated mid-period', () => {
    const window = measurementWindow({ activatedAt: '2024-06-16T00:00:00.000Z', ceasedAt: null }, JUNE_START, JULY_START, AFTER_JUNE);
    expect(window?.start).toBe(Date.parse('2024-06-16T00:00:00Z'));
    expect(window?.end).toBe(JULY_START.getTime());
  });

  it('is null for services never activated or ceased before the period', () => {
    expect(measurementWindow({ activatedAt: null, ceasedAt: null }, JUNE_START, JULY_START, AFTER_JUNE)).toBeNull();
    expect(
      measurementWindow({ activatedAt: '2024-01-01T00:00:00.000Z', ceasedAt: '2024-05-01T00:00:00.000Z' }, JUNE_START, JULY_START, AFTER_JUNE)
    ).toBeNull();
  });

  it('stops at now for the current period', () => {
    const now = new Date('2024-06-10T00:00:00Z');
    expect(measurementWindow({ activatedAt: '2024-01-01T00:00:00.000Z', ceasedAt: null }, JUNE_START, JULY_START, now)?.end).toBe(now.getTime());
  });
});

describe('availabilityMilliPct', () => {
  it('floors to avoid over-reporting', () => {
    // 43,200 min month, 22 min down => 99.9490...%
    expect(availabilityMilliPct(43_200 * 60_000, 22 * 60_000)).toBe(99_949);
  });

  it('is 100% when nothing was measured', () => {
    expect(availabilityMilliPct(0, 0)).toBe(100_000);
  });
});

describe('creditBpsFor', () => {
  const policy = availabilityPolicy('ENHANCED');

  it.each([
    [99_950, 0],
    [99_899, 500],
    [99_400, 1_500],
    [90_000, 3_000]
  ])('availability %i => %i bps', (milliPct, bps) => {
    expect(creditBpsFor(policy, milliPct)).toBe(bps);
  });
});

describe('serviceAvailability', () => {
  const service = makeService({ activatedAt: '2024-01-10T00:00:00.000Z', monthlyChargeMinor: 12_000, slaTier: 'ENHANCED' });

  it('ignores planned work and merges overlapping unplanned outages', () => {
    const result = serviceAvailability(
      service,
      [
        outage('2024-06-10T10:00:00Z', '2024-06-10T11:00:00Z'),
        outage('2024-06-10T10:30:00Z', '2024-06-10T11:30:00Z'),
        outage('2024-06-12T01:00:00Z', '2024-06-12T05:00:00Z', true)
      ],
      JUNE_START,
      JULY_START,
      AFTER_JUNE
    )!;
    expect(result.downtimeMinutes).toBe(90);
    expect(result.plannedMinutes).toBe(240);
    expect(result.outageCount).toBe(1);
    expect(result.availabilityMilliPct).toBe(99_791);
    expect(result.met).toBe(false);
    expect(result.creditBps).toBe(500);
    expect(result.credit).toEqual({ amountMinor: 600, currency: 'GBP' });
  });

  it('clips outages that straddle the period boundary', () => {
    const result = serviceAvailability(service, [outage('2024-05-31T23:00:00Z', '2024-06-01T00:30:00Z')], JUNE_START, JULY_START, AFTER_JUNE)!;
    expect(result.downtimeMinutes).toBe(30);
  });

  it('counts an ongoing outage up to now', () => {
    const now = new Date('2024-06-20T12:00:00Z');
    const result = serviceAvailability(service, [outage('2024-06-20T10:00:00Z', null)], JUNE_START, JULY_START, now)!;
    expect(result.downtimeMinutes).toBe(120);
  });

  it('ignores outages belonging to other services', () => {
    const other: OutageWindow = { ...outage('2024-06-10T10:00:00Z', '2024-06-10T20:00:00Z'), serviceId: 'other' };
    expect(serviceAvailability(service, [other], JUNE_START, JULY_START, AFTER_JUNE)!.met).toBe(true);
  });
});
