import { AuthContext, can } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { computeDueDates, effectivePausedMs } from './ticket-sla';
import { TicketActor } from './ticket-state-machine';
import { TicketPatch } from './tickets.repository';
import { NewTicketInput, Ticket, TicketStatus } from './tickets.types';

/** Support agents act as 'agent'; everyone else is a 'customer'. */
export function actorFor(ctx: AuthContext): TicketActor {
  if (can(ctx, 'tickets:internal')) return 'agent';
  return 'customer';
}

/**
 * Field changes implied by a status transition: pausing/resuming the resolution clock,
 * stamping resolution/closure, and treating any agent action as the first response.
 */
export function statusTransitionPatch(ticket: Ticket, to: TicketStatus, actor: TicketActor, now: Date): TicketPatch {
  const patch: TicketPatch = { status: to };
  const nowIso = now.toISOString();

  if (actor === 'agent' && !ticket.firstResponseAt) patch.firstResponseAt = nowIso;

  let pausedMs = ticket.pausedMs;
  if (ticket.status === 'PENDING_CUSTOMER') {
    pausedMs = effectivePausedMs(ticket, now);
    patch.pendingSince = null;
  }
  if (ticket.status === 'RESOLVED' && to === 'IN_PROGRESS' && ticket.resolvedAt) {
    // Time spent resolved does not count against the reopened ticket.
    pausedMs += Math.max(0, now.getTime() - new Date(ticket.resolvedAt).getTime());
    patch.resolvedAt = null;
  }
  if (to === 'PENDING_CUSTOMER') patch.pendingSince = nowIso;
  if (to === 'RESOLVED') patch.resolvedAt = nowIso;
  if (to === 'CLOSED') patch.closedAt = nowIso;

  if (pausedMs !== ticket.pausedMs) {
    patch.pausedMs = pausedMs;
    const due = computeDueDates(ticket.slaTier, ticket.priority, new Date(ticket.openedAt), pausedMs);
    patch.resolutionDueAt = due.resolutionDueAt.toISOString();
  }
  return patch;
}

/** Validates the category/priority/service combination for a new ticket. */
export function assertTicketShape(input: NewTicketInput, serviceStatus: string | null): void {
  if (input.category === 'FAULT' && !input.serviceId) {
    throw new BusinessRuleError('fault-needs-service', 'A fault must be raised against a specific service');
  }
  if (input.priority === 'P1') {
    if (input.category !== 'FAULT') {
      throw new BusinessRuleError('p1-fault-only', 'Priority P1 is reserved for faults causing a total loss of service');
    }
    if (serviceStatus !== 'ACTIVE') {
      throw new BusinessRuleError('p1-active-service', 'Priority P1 can only be raised against an active service');
    }
  }
  if (input.category === 'BILLING' && (input.priority === 'P1' || input.priority === 'P2')) {
    throw new BusinessRuleError('billing-priority', 'Billing queries are handled at priority P3 or P4');
  }
}
