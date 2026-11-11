import { SlaTier } from '../inventory/inventory.types';
import { TicketPriority } from '../sla/sla.policy';

export const TICKET_CATEGORIES = ['FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** Same values as TicketPriority in sla.policy. */
export const TICKET_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER'];

export type TicketEventKind = 'COMMENT' | 'STATUS_CHANGE' | 'ESCALATION' | 'PRIORITY_CHANGE';

export interface Ticket {
  id: string;
  accountId: string;
  reference: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  serviceId: string | null;
  siteId: string | null;
  subject: string;
  description: string;
  raisedBy: string;
  contactPhone: string | null;
  escalationLevel: number;
  slaTier: SlaTier;
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  pendingSince: string | null;
  pausedMs: number;
  responseDueAt: string;
  resolutionDueAt: string;
  version: number;
}

export interface TicketEvent {
  id: number;
  ticketId: string;
  kind: TicketEventKind;
  authorId: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  internal: boolean;
  createdAt: string;
}

export type SlaMeasureState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'PAUSED';

export interface TicketSlaView {
  response: { dueAt: string; state: SlaMeasureState; consumedBps: number };
  resolution: { dueAt: string; state: SlaMeasureState; consumedBps: number };
}

export interface TicketView extends Ticket {
  sla: TicketSlaView;
}

export interface TicketDetail extends TicketView {
  events: TicketEvent[];
}

export interface NewTicketInput {
  category: TicketCategory;
  priority: TicketPriority;
  serviceId?: string | null;
  siteId?: string | null;
  subject: string;
  description: string;
  contactPhone?: string | null;
}

/** A resolved ticket may be reopened by the customer within this many days. */
export const REOPEN_WINDOW_DAYS = 7;
/** Minimum gap between two escalations of the same ticket. */
export const ESCALATION_COOLDOWN_MINUTES = 120;
/** Share of the resolution target that must be consumed before a customer may escalate (P1 excepted). */
export const CUSTOMER_ESCALATION_MIN_CONSUMED_BPS = 5_000;
/** Share of a target consumed at which a measure is flagged AT_RISK. */
export const AT_RISK_BPS = 7_500;
