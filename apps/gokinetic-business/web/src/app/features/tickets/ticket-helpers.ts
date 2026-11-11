import { Service, TicketCategory, TicketPriority, TicketStatus } from '../../core/models/api.models';
import { humanise } from '../../shared/status-badge.component';

export const CATEGORIES: TicketCategory[] = ['FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL'];
export const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3', 'P4'];

/** Priorities a customer may pick, mirroring the API's ticket-shape rules. */
export function allowedPriorities(category: TicketCategory, service: Service | undefined): TicketPriority[] {
  if (category === 'BILLING') return ['P3', 'P4'];
  if (category === 'FAULT' && service?.status === 'ACTIVE') return PRIORITIES;
  return ['P2', 'P3', 'P4'];
}

/** Customer-facing label for a status transition button. */
export function transitionLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'CLOSED') {
    if (from === 'RESOLVED') return 'Confirm resolved';
    return 'Withdraw ticket';
  }
  if (from === 'RESOLVED' && to === 'IN_PROGRESS') return 'Reopen';
  return `Mark ${humanise(to).toLowerCase()}`;
}
