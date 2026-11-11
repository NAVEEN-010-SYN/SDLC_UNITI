/**
 * Wire types for the Go Kinetic Business API (/api/v1). Money is integer minor units plus an
 * ISO-4217 currency; timestamps are ISO-8601 UTC strings.
 */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT';
export type SlaTier = 'STANDARD' | 'ENHANCED' | 'PREMIUM';

export type Permission =
  | 'sites:read'
  | 'sites:manage'
  | 'services:read'
  | 'users:read'
  | 'users:manage'
  | 'orders:read'
  | 'orders:create'
  | 'orders:approve'
  | 'orders:fulfil'
  | 'billing:read'
  | 'billing:manage'
  | 'sla:read'
  | 'tickets:read'
  | 'tickets:create'
  | 'tickets:escalate'
  | 'tickets:internal'
  | 'contracts:read'
  | 'contracts:renew'
  | 'documents:read'
  | 'audit:read';

export interface Me {
  userId: string;
  email: string;
  roles: Role[];
  accountId: string;
  siteScope: string[] | null;
  permissions: Permission[];
  account: { id: string; name: string; status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'; slaTier: SlaTier; currency: string };
}

export interface Account {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  currency: string;
  slaTier: SlaTier;
  approvalThresholdMinor: number;
}

// Inventory
export type SiteStatus = 'PENDING' | 'ACTIVE' | 'DECOMMISSIONED';
export type ServiceStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CEASED';
export type ServiceCategory = 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED';

export interface Site {
  id: string;
  accountId: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  status: SiteStatus;
  costCentreId: string | null;
  createdAt: string;
}

export interface SiteSummary extends Site {
  activeServiceCount: number;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
}

export interface Service {
  id: string;
  accountId: string;
  siteId: string;
  contractId: string | null;
  costCentreId: string | null;
  productCode: string;
  productName: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  status: ServiceStatus;
  slaTier: SlaTier;
  monthlyChargeMinor: number;
  currency: string;
  activatedAt: string | null;
  ceasedAt: string | null;
}

export interface SiteDetail extends Site {
  services: Service[];
  monthlyRecurringMinor: number;
}

export interface InventorySummary {
  siteCount: number;
  activeSiteCount: number;
  serviceCount: number;
  byCategory: Record<ServiceCategory, { count: number; monthlyRecurringMinor: number }>;
  byStatus: Record<ServiceStatus, number>;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
  currency: string;
}

// Orders
export type OrderType = 'PROVIDE' | 'MOVE' | 'ADD' | 'CHANGE' | 'CEASE';
export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';

export interface Order {
  id: string;
  accountId: string;
  batchId: string | null;
  reference: string;
  orderType: OrderType;
  status: OrderStatus;
  siteId: string;
  targetSiteId: string | null;
  serviceId: string | null;
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  currency: string;
  requiresApproval: boolean;
  approvedBy: string | null;
  requestedDate: string | null;
  notes: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusChange {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  reason: string | null;
  changedAt: string;
}

export interface OrderDetail extends Order {
  history: OrderStatusChange[];
}

export interface OrderRequest {
  orderType: OrderType;
  siteId: string;
  targetSiteId?: string | null;
  serviceId?: string | null;
  productCode?: string | null;
  requestedDate?: string | null;
  notes?: string | null;
}

export interface OrderQuote {
  productCode: string | null;
  bandwidthMbps: number | null;
  monthlyDeltaMinor: number;
  oneOffChargeMinor: number;
  requiresApproval: boolean;
}

export interface CatalogueProduct {
  code: string;
  name: string;
  category: ServiceCategory;
  bandwidthMbps: number | null;
  monthlyPriceMinor: number;
  installChargeMinor: number;
  requiresConnectivity: boolean;
}

// Billing
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'OVERDUE' | 'DISPUTED' | 'VOID';

export interface Invoice {
  id: string;
  accountId: string;
  number: string;
  period: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  serviceId: string | null;
  siteId: string | null;
  description: string;
  category: string;
  amountMinor: number;
  costCentreId: string | null;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  daysOverdue: number;
}

export interface SpendTrendPoint {
  period: string;
  totalMinor: number;
  changeMinor: number | null;
  changeBps: number | null;
}

export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX';

export interface PaymentMethod {
  id: string;
  kind: 'CARD' | 'DIRECT_DEBIT';
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdAt: string;
  expired: boolean;
  expiresSoon: boolean;
}

export type AddPaymentMethod =
  | {
      kind: 'CARD';
      providerToken: string;
      holderName: string;
      cardBrand: CardBrand;
      last4: string;
      expiryMonth: number;
      expiryYear: number;
      makeDefault: boolean;
    }
  | { kind: 'DIRECT_DEBIT'; holderName: string; sortCode: string; accountNumber: string; makeDefault: boolean };

export * from './support.models';
