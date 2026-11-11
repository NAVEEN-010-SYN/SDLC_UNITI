/**
 * Wire types shared by API helpers and specs. They mirror the OpenAPI specs in
 * qa/swagger; amounts are integer minor units with an ISO-4217 currency.
 */

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type DealStage = 'REGISTERED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST' | 'EXPIRED';

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ServiceAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Product {
  sku: string;
  name: string;
  category: 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED';
  downloadMbps?: number;
  uploadMbps?: number;
  monthlyPrice: Money;
  installationFee: Money;
  contractMonths: number;
  segment: 'B2C' | 'B2B';
}

export interface OrderLine {
  sku: string;
  quantity: number;
}

export interface Order {
  id: string;
  accountId: string;
  status: OrderStatus;
  lines: OrderLine[];
  serviceAddress: ServiceAddress;
  total: Money;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  segment: 'B2C' | 'B2B';
  billingEmail: string;
}

export interface Invoice {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  amountDue: Money;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';
  dueDate: string;
}

export interface Ticket {
  id: string;
  accountId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  partnerId: string;
  customerName: string;
  stage: DealStage;
  estimatedMonthlyValue: Money;
  products: string[];
  expiresAt: string;
}

export interface SdwanSite {
  id: string;
  accountId: string;
  name: string;
  vendor: 'VELOCLOUD' | 'FORTINET';
  edgeModel: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface ChangeRequest {
  id: string;
  siteId: string;
  type: 'BANDWIDTH' | 'FIREWALL_RULE' | 'BUSINESS_POLICY' | 'EDGE_REPLACEMENT';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SCHEDULED' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK';
  scheduledFor?: string;
}
