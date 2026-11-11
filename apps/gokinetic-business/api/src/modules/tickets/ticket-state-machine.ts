import { InvalidStateTransitionError } from '../../lib/errors';
import { TicketStatus } from './tickets.types';

/**
 * Ticket lifecycle: OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED.
 *
 * Support agents drive work states. Customers may withdraw an OPEN ticket, confirm a
 * resolution (close it), reopen a recently resolved ticket, and implicitly hand a
 * PENDING_CUSTOMER ticket back to the agent by replying.
 */
export type TicketActor = 'customer' | 'agent';

const TRANSITIONS: Readonly<Record<TicketStatus, Partial<Record<TicketStatus, readonly TicketActor[]>>>> = {
  OPEN: {
    IN_PROGRESS: ['agent'],
    PENDING_CUSTOMER: ['agent'],
    RESOLVED: ['agent'],
    CLOSED: ['customer', 'agent']
  },
  IN_PROGRESS: {
    PENDING_CUSTOMER: ['agent'],
    RESOLVED: ['agent']
  },
  PENDING_CUSTOMER: {
    IN_PROGRESS: ['agent', 'customer'],
    RESOLVED: ['agent']
  },
  RESOLVED: {
    IN_PROGRESS: ['customer', 'agent'],
    CLOSED: ['customer', 'agent']
  },
  CLOSED: {}
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus, actor: TicketActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus, actor: TicketActor): void {
  if (!canTransitionTicket(from, to, actor)) throw new InvalidStateTransitionError('Ticket', from, to);
}

export function nextStatusesFor(from: TicketStatus, actor: TicketActor): TicketStatus[] {
  return (Object.entries(TRANSITIONS[from]) as Array<[TicketStatus, readonly TicketActor[]]>)
    .filter(([, actors]) => actors.includes(actor))
    .map(([status]) => status);
}

/** The SLA clock is stopped while the ticket waits on the customer or once it is resolved. */
export function isClockRunning(status: TicketStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}
