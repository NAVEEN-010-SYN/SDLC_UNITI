/** Wire contracts of the iConnect Wholesale API (/api/v1). Money is integer minor units; instants are ISO-8601 UTC. */

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Product {
  code: string;
  name: string;
  downstreamMbps: number;
  upstreamMbps: number;
  careLevels: string[];
  isActive: boolean;
}

export interface PriceBookEntry {
  productCode: string;
  careLevel: string;
  monthlyRentalMinor: number;
  connectionChargeMinor: number;
  migrationChargeMinor: number;
  modifyChargeMinor: number;
}

export interface PriceBook {
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
  entries: PriceBookEntry[];
  tiers: { minimumActiveLines: number; discountBps: number }[];
}

export interface AddressMatch {
  uprn: string;
  address: string;
  postcode: string;
  buildStatus: string;
}

export interface Availability {
  uprn: string;
  address: string;
  exchangeCode: string;
  buildStatus: string;
  maxDownstreamMbps: number;
  readyForServiceDate: string | null;
  hasActiveService: boolean;
  hasOpenOrder: boolean;
  recommendedOrderType: string;
  earliestCompletionDate: string;
  products: { product: Product; orderable: boolean; reason: string | null }[];
}

export type OrderType = 'PROVIDE' | 'CEASE' | 'MODIFY' | 'MIGRATE';

export interface PlaceOrderRequest {
  partnerReference: string;
  orderType: OrderType;
  uprn: string;
  productCode: string | null;
  careLevel: string | null;
  existingServiceId: string | null;
  migrationAuthCode: string | null;
  requestedDate: string;
}

export interface OrderSummary {
  id: string;
  reference: string;
  partnerReference: string;
  type: OrderType;
  status: string;
  uprn: string;
  productCode: string | null;
  requestedDate: string;
  committedDate: string | null;
  onHold: boolean;
  slaStatus: string | null;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  careLevel: string;
  existingServiceId: string | null;
  resultingServiceId: string | null;
  completedDate: string | null;
  appointmentSlotId: string | null;
  monthlyRentalMinor: number | null;
  oneOffChargeMinor: number | null;
  cancellationChargeMinor: number | null;
  currency: string;
  failureReason: string | null;
  holdReason: string | null;
  sla: { status: string; elapsedWorkingHours: number; targetWorkingHours: number; dueAt: string | null; workingDaysLate: number } | null;
  allowedActions: string[];
  history: { from: string | null; to: string; at: string; note: string; actor: string | null }[];
}

export interface AppointmentSlot {
  id: string;
  date: string;
  band: string;
  remaining: number;
  meetsCommittedDate: boolean;
}

export interface BulkRowError {
  row: number;
  column: string;
  code: string;
  message: string;
}

export interface BulkUploadResult {
  uploadId: string | null;
  fileName: string;
  status: string;
  rowCount: number;
  validRows: number;
  ordersCreated: number;
  ordersRejected: number;
  errors: BulkRowError[];
  orders: { line: number; partnerReference: string; orderReference: string | null; status: string; reason: string | null }[];
}

export interface FaultSummary {
  id: string;
  reference: string;
  serviceUprn: string;
  priority: string;
  status: string;
  category: string;
  slaStatus: string;
  dueAt: string | null;
  createdAt: string;
}

export interface FaultDetail {
  id: string;
  reference: string;
  serviceId: string;
  uprn: string;
  priority: string;
  category: string;
  careLevel: string;
  status: string;
  description: string;
  sla: { status: string; elapsedWorkingHours: number; targetWorkingHours: number; dueAt: string | null; calendar: string };
  resolvedAt: string | null;
  resolutionCode: string | null;
  serviceCreditMinor: number | null;
  serviceCreditBasis: string | null;
  allowedActions: string[];
  notes: { at: string; author: string; text: string }[];
  createdAt: string;
}

export interface StatementSummary {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalMinor: number;
  currency: string;
  dueDate: string | null;
}

export interface Dispute {
  id: string;
  reference: string;
  statementId: string;
  lineIds: string[];
  reason: string;
  claimedMinor: number;
  status: string;
  awardedMinor: number | null;
  outcome: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface StatementDetail extends Omit<StatementSummary, 'totalMinor'> {
  chargesMinor: number;
  creditsMinor: number;
  totalMinor: number;
  issuedAt: string | null;
  lines: { id: string; lineNumber: number; type: string; description: string; quantity: number; amountMinor: number; sourceReference: string | null }[];
  disputes: Dispute[];
}

export interface SlaSummary {
  periodStart: string;
  asOf: string;
  openOrders: number;
  ordersAtRisk: number;
  ordersBreached: number;
  openFaults: number;
  faultsAtRisk: number;
  faultsBreached: number;
  faultCreditsMinor: number;
  lateDeliveryCreditsMinor: number;
  currency: string;
  attention: { id: string; kind: 'ORDER' | 'FAULT'; reference: string; status: string; slaStatus: string; dueAt: string | null; remainingWorkingHours: number }[];
}

export interface SlaPolicy {
  repairTargets: { careLevel: string; priority: string; calendar: string; targetHours: number }[];
  orderLeadTimeWorkingDays: Record<string, number>;
  creditTerms: { careLevel: string; faultCreditBpsPerBreachDay: number; faultCreditCapBps: number; lateDeliveryPerDayMinor: number; lateDeliveryMaxDays: number; missedAppointmentMinor: number }[];
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';
}
