export const INVOICE_STATUSES = ['ISSUED', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

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

export interface CostCentre {
  id: string;
  accountId: string;
  code: string;
  name: string;
  monthlyBudgetMinor: number | null;
  active: boolean;
}

export interface SiteSplitRule {
  siteId: string;
  costCentreId: string;
  shareBps: number;
}

export const UNALLOCATED = 'UNALLOCATED';

export type AllocationSource = 'SERVICE' | 'SITE_SPLIT' | 'SITE' | 'UNALLOCATED';

export interface AllocatedLine {
  lineId: string;
  costCentreId: string;
  amountMinor: number;
  source: AllocationSource;
}

export interface CostCentreAllocation {
  costCentreId: string;
  code: string;
  name: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lineCount: number;
  budgetMinor: number | null;
  /** Positive when spend exceeds the monthly budget. */
  overBudgetMinor: number;
  shareBps: number;
}

export interface AllocationReport {
  invoiceId: string;
  invoiceNumber: string;
  period: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  allocations: CostCentreAllocation[];
  lines: AllocatedLine[];
}

/** Customers may dispute an invoice within this many days of issue. */
export const DISPUTE_WINDOW_DAYS = 60;
