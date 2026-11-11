/**
 * Users, tickets, SLA and audit wire types. Re-exported from api.models.ts.
 */
import type { SlaTier } from './api.models';

// Users
export type BusinessRole = 'BUSINESS_ADMIN' | 'BUSINESS_USER';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type UserAction = 'suspend' | 'reactivate' | 'deactivate';

export interface BusinessUser {
  id: string;
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  status: UserStatus;
  siteScope: string[] | null;
  invitedBy: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
}

// Tickets
export type TicketCategory = 'FAULT' | 'SERVICE_REQUEST' | 'BILLING' | 'GENERAL';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type SlaMeasureState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'PAUSED';

export interface SlaMeasure {
  dueAt: string;
  state: SlaMeasureState;
  consumedBps: number;
}

export interface Ticket {
  id: string;
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
  version: number;
  sla: { response: SlaMeasure; resolution: SlaMeasure };
}

export interface TicketEvent {
  id: number;
  kind: 'COMMENT' | 'STATUS_CHANGE' | 'ESCALATION' | 'PRIORITY_CHANGE';
  authorId: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  internal: boolean;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  events: TicketEvent[];
  allowedStatuses: TicketStatus[];
}

export interface NewTicket {
  category: TicketCategory;
  priority: TicketPriority;
  serviceId?: string | null;
  siteId?: string | null;
  subject: string;
  description: string;
  contactPhone?: string | null;
}

// SLA
export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ServiceAvailability {
  serviceId: string;
  productName: string;
  siteId: string;
  slaTier: SlaTier;
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

export interface TicketCompliance {
  priority: TicketPriority;
  resolvedCount: number;
  responseMetCount: number;
  resolutionMetCount: number;
  responseMetBps: number | null;
  resolutionMetBps: number | null;
}

export interface SlaReport {
  period: string;
  provisional: boolean;
  generatedAt: string;
  services: ServiceAvailability[];
  servicesMeasured: number;
  servicesBreached: number;
  overallAvailabilityMilliPct: number | null;
  totalCredit: Money;
  tickets: TicketCompliance[];
}

// Audit
export interface AuditEntry {
  id: number;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
  summary: string;
}
