import { SlaTier } from '../inventory/inventory.types';

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface TicketSlaTarget {
  /** Minutes until first response is due. */
  responseMinutes: number;
  /** Minutes until resolution is due. */
  resolutionMinutes: number;
  /** 24x7 clocks run continuously; business-hours clocks only tick Mon-Fri 08:00-18:00 UTC. */
  clock: '24x7' | 'BUSINESS_HOURS';
}

export interface CreditBand {
  /** Availability strictly below this (in thousandths of a percent, e.g. 99_900 = 99.900%). */
  belowMilliPct: number;
  /** Credit as basis points of the service's monthly charge. */
  creditBps: number;
}

export interface AvailabilityPolicy {
  targetMilliPct: number;
  creditBands: CreditBand[];
  /** Upper bound on the credit for one service in one month, in basis points. */
  maxCreditBps: number;
}

const HOUR = 60;

const TICKET_TARGETS: Record<SlaTier, Record<TicketPriority, TicketSlaTarget>> = {
  STANDARD: {
    P1: { responseMinutes: 60, resolutionMinutes: 8 * HOUR, clock: '24x7' },
    P2: { responseMinutes: 2 * HOUR, resolutionMinutes: 24 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 8 * HOUR, resolutionMinutes: 30 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 16 * HOUR, resolutionMinutes: 50 * HOUR, clock: 'BUSINESS_HOURS' }
  },
  ENHANCED: {
    P1: { responseMinutes: 30, resolutionMinutes: 5 * HOUR, clock: '24x7' },
    P2: { responseMinutes: HOUR, resolutionMinutes: 12 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 4 * HOUR, resolutionMinutes: 20 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 8 * HOUR, resolutionMinutes: 40 * HOUR, clock: 'BUSINESS_HOURS' }
  },
  PREMIUM: {
    P1: { responseMinutes: 15, resolutionMinutes: 4 * HOUR, clock: '24x7' },
    P2: { responseMinutes: 30, resolutionMinutes: 8 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 2 * HOUR, resolutionMinutes: 10 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 4 * HOUR, resolutionMinutes: 20 * HOUR, clock: 'BUSINESS_HOURS' }
  }
};

const AVAILABILITY: Record<SlaTier, AvailabilityPolicy> = {
  STANDARD: {
    targetMilliPct: 99_500,
    creditBands: [
      { belowMilliPct: 99_500, creditBps: 500 },
      { belowMilliPct: 99_000, creditBps: 1_000 },
      { belowMilliPct: 98_000, creditBps: 2_000 }
    ],
    maxCreditBps: 2_000
  },
  ENHANCED: {
    targetMilliPct: 99_900,
    creditBands: [
      { belowMilliPct: 99_900, creditBps: 500 },
      { belowMilliPct: 99_500, creditBps: 1_500 },
      { belowMilliPct: 99_000, creditBps: 3_000 }
    ],
    maxCreditBps: 3_000
  },
  PREMIUM: {
    targetMilliPct: 99_950,
    creditBands: [
      { belowMilliPct: 99_950, creditBps: 1_000 },
      { belowMilliPct: 99_900, creditBps: 2_500 },
      { belowMilliPct: 99_500, creditBps: 5_000 }
    ],
    maxCreditBps: 5_000
  }
};

export function ticketTarget(tier: SlaTier, priority: TicketPriority): TicketSlaTarget {
  return TICKET_TARGETS[tier][priority];
}

export function availabilityPolicy(tier: SlaTier): AvailabilityPolicy {
  return AVAILABILITY[tier];
}

/** Escalation thresholds as a fraction of the resolution target already consumed. */
export const ESCALATION_THRESHOLDS = [
  { level: 1, consumedBps: 5_000 },
  { level: 2, consumedBps: 7_500 },
  { level: 3, consumedBps: 10_000 }
] as const;

export const MAX_ESCALATION_LEVEL = 3;
