import { SlaTier } from '../inventory/inventory.types';
import { dueDate, elapsedSlaMinutes } from '../sla/sla.clock';
import { ESCALATION_THRESHOLDS, MAX_ESCALATION_LEVEL, TicketPriority, ticketTarget } from '../sla/sla.policy';
import { AT_RISK_BPS, SlaMeasureState, Ticket, TicketSlaView } from './tickets.types';

export interface DueDates {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

/** Due dates for a ticket opened at `openedAt`, shifted by any time spent waiting on the customer. */
export function computeDueDates(tier: SlaTier, priority: TicketPriority, openedAt: Date, pausedMs = 0): DueDates {
  const target = ticketTarget(tier, priority);
  return {
    // Response is never paused: the first reply must come before we can ask the customer anything.
    responseDueAt: dueDate(openedAt, target.responseMinutes, target.clock),
    resolutionDueAt: dueDate(openedAt, target.resolutionMinutes, target.clock, pausedMs)
  };
}

/** Total paused time including an in-flight pending period. */
export function effectivePausedMs(ticket: Pick<Ticket, 'pausedMs' | 'pendingSince'>, now: Date): number {
  if (!ticket.pendingSince) return ticket.pausedMs;
  return ticket.pausedMs + Math.max(0, now.getTime() - new Date(ticket.pendingSince).getTime());
}

function consumedBps(elapsedMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 10_000;
  return Math.round((elapsedMinutes * 10_000) / targetMinutes);
}

function measureState(params: {
  completedAt: Date | null;
  dueAt: Date;
  now: Date;
  consumed: number;
  paused: boolean;
}): SlaMeasureState {
  if (params.completedAt) return params.completedAt <= params.dueAt ? 'MET' : 'BREACHED';
  if (params.now > params.dueAt) return 'BREACHED';
  if (params.paused) return 'PAUSED';
  return params.consumed >= AT_RISK_BPS ? 'AT_RISK' : 'ON_TRACK';
}

export function resolutionConsumedBps(ticket: Ticket, now: Date): number {
  const target = ticketTarget(ticket.slaTier, ticket.priority);
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : now;
  const elapsed = elapsedSlaMinutes(new Date(ticket.openedAt), end, target.clock, effectivePausedMs(ticket, end));
  return consumedBps(elapsed, target.resolutionMinutes);
}

export function slaView(ticket: Ticket, now: Date): TicketSlaView {
  const target = ticketTarget(ticket.slaTier, ticket.priority);
  const openedAt = new Date(ticket.openedAt);
  const responseEnd = ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : now;
  const responseConsumed = consumedBps(elapsedSlaMinutes(openedAt, responseEnd, target.clock), target.responseMinutes);
  const resolutionConsumed = resolutionConsumedBps(ticket, now);

  return {
    response: {
      dueAt: ticket.responseDueAt,
      consumedBps: responseConsumed,
      state: measureState({
        completedAt: ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : null,
        dueAt: new Date(ticket.responseDueAt),
        now,
        consumed: responseConsumed,
        paused: false
      })
    },
    resolution: {
      dueAt: ticket.resolutionDueAt,
      consumedBps: resolutionConsumed,
      state: measureState({
        completedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : null,
        dueAt: new Date(ticket.resolutionDueAt),
        now,
        consumed: resolutionConsumed,
        paused: ticket.status === 'PENDING_CUSTOMER'
      })
    }
  };
}

/** Escalation level implied purely by how much of the resolution target has been consumed. */
export function automaticEscalationLevel(consumed: number): number {
  let level = 0;
  for (const threshold of ESCALATION_THRESHOLDS) {
    if (consumed >= threshold.consumedBps) level = threshold.level;
  }
  return Math.min(level, MAX_ESCALATION_LEVEL);
}
