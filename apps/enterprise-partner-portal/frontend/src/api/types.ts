/** Wire types mirroring the API DTOs. Money is always integer minor units + ISO currency. */

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type Role = 'PARTNER_ADMIN' | 'PARTNER_AGENT' | 'CHANNEL_MANAGER' | 'SUPPORT_AGENT';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'DISQUALIFIED';
export type LeadSource = 'REFERRAL' | 'EVENT' | 'WEBSITE' | 'OUTBOUND' | 'UNITI_SHARED' | 'OTHER';

export interface Lead {
  id: string;
  reference: string;
  ownerSubject: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  postcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  productInterest?: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  scoreBand: 'HOT' | 'WARM' | 'COLD';
  notes?: string;
  nextActionAt?: string;
  disqualifyReason?: string;
  convertedDealId?: string;
  createdAt: string;
}

export interface LeadRequest {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  postcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  productInterest?: string;
  source: LeadSource;
  notes?: string;
  nextActionAt?: string;
}

export interface ConvertLeadRequest {
  customerCompanyNumber?: string;
  customerWebsite?: string;
  expectedCloseDate: string;
}

export interface ConvertLeadResult {
  dealId: string;
  dealReference: string;
  dealStatus: DealStatus;
  hasConflict: boolean;
}

export type DealStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'WON' | 'LOST' | 'EXPIRED' | 'WITHDRAWN';

export interface Deal {
  id: string;
  reference: string;
  customerName: string;
  customerPostcode: string;
  siteCount: number;
  estimatedMrcMinor: number;
  currency: string;
  expectedCloseDate: string;
  productInterest: string;
  status: DealStatus;
  hasConflict: boolean;
  protectedUntil?: string;
  extensionsUsed: number;
  extensionAvailable: boolean;
  decisionReason?: string;
  submittedAt: string;
}

export type ProductCategory = 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED' | 'ADD_ON';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  bandwidthMbps?: number;
  monthlyPriceMinor: number;
  installPriceMinor: number;
  minTermMonths: number;
  perSite: boolean;
  currency: string;
}

export type QuoteStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'ORDERED';
export type ApprovalLevel = 'NONE' | 'CHANNEL_MANAGER' | 'DEAL_DESK';

export interface QuoteLineRequest {
  sku: string;
  siteName: string;
  sitePostcode: string;
  quantity: number;
}

export interface QuoteRequest {
  dealId?: string;
  customerName: string;
  customerAccountId?: string;
  customerContactEmail: string;
  termMonths: number;
  requestedDiscountPercent: number;
  justification?: string;
  lines: QuoteLineRequest[];
}

export interface PricingPreview {
  listMrcMinor: number;
  termDiscountMinor: number;
  volumeDiscountMinor: number;
  partnerDiscountMinor: number;
  netMrcMinor: number;
  nrcMinor: number;
  nrcWaived: boolean;
  totalContractValueMinor: number;
  termDiscountPercent: number;
  volumeDiscountPercent: number;
  effectiveDiscountPercent: number;
  selfApprovedAllowancePercent: number;
  approvalLevel: ApprovalLevel;
  blockers: string[];
  currency: string;
}

export interface Quote {
  id: string;
  reference: string;
  dealId?: string;
  customerName: string;
  termMonths: number;
  currency: string;
  status: QuoteStatus;
  revision: number;
  requestedDiscountPercent: number;
  netMrcMinor: number;
  totalContractValueMinor: number;
  approvalLevel: ApprovalLevel;
  approvalsReceived: number;
  validUntil?: string;
  createdAt: string;
}

export type StatementStatus = 'DRAFT' | 'ISSUED' | 'DISPUTED' | 'APPROVED' | 'CARRIED_FORWARD' | 'PAID';

export interface Statement {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: StatementStatus;
  accruedMinor: number;
  clawbackMinor: number;
  adjustmentMinor: number;
  broughtForwardMinor: number;
  netPayableMinor: number;
  issuedAt?: string;
  disputeReason?: string;
  disputable: boolean;
}

export interface StatementEntry {
  id: string;
  orderReference?: string;
  type: 'ACCRUAL' | 'CLAWBACK' | 'ADJUSTMENT';
  component: string;
  description: string;
  amountMinor: number;
  currency: string;
  earnedOn: string;
}

export interface Payout {
  id: string;
  amountMinor: number;
  currency: string;
  status: 'SCHEDULED' | 'PAID' | 'FAILED';
  scheduledFor: string;
  paymentReference?: string;
  paidAt?: string;
}

export interface StatementDetail {
  statement: Statement;
  entries: StatementEntry[];
  payout?: Payout;
}

export interface CommissionSummary {
  currency: string;
  tier: string;
  tierRateBps: number;
  earnedYearToDateMinor: number;
  unbilledMinor: number;
  paidYearToDateMinor: number;
  outstandingPayoutMinor: number;
}

export interface StageTotal {
  count: number;
  mrcMinor: number;
}

export interface PipelineKpis {
  currency: string;
  windowStart: string;
  leadsByStatus: Partial<Record<LeadStatus, number>>;
  newLeads: number;
  leadConversionRate: number | null;
  dealsByStatus: Partial<Record<DealStatus, StageTotal>>;
  openPipelineMrcMinor: number;
  dealWinRate: number | null;
  quotesByStatus: Partial<Record<QuoteStatus, number>>;
  quoteAcceptanceRate: number | null;
  ordersByStatus: Partial<Record<string, StageTotal>>;
  ordersInFlight: number;
  activatedMrcMinor: number;
}

export type PartnerUserRole = 'PARTNER_ADMIN' | 'PARTNER_AGENT';

export interface PartnerUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: PartnerUserRole;
  status: 'INVITED' | 'ACTIVE' | 'DEACTIVATED';
  certified: boolean;
  certifiedUntil?: string;
  inviteExpiresAt: string;
  lastLoginAt?: string;
}

export interface SeatUsage {
  seatLimit: number;
  seatsUsed: number;
  seatsAvailable: number;
}
