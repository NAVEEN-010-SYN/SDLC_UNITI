export const SITE_STATUSES = ['PENDING', 'ACTIVE', 'DECOMMISSIONED'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const SERVICE_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'CEASED'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

export const SERVICE_CATEGORIES = ['BROADBAND', 'VOICE', 'SDWAN', 'HOSTED'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SLA_TIERS = ['STANDARD', 'ENHANCED', 'PREMIUM'] as const;
export type SlaTier = (typeof SLA_TIERS)[number];

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

export interface SiteSummary extends Site {
  activeServiceCount: number;
  monthlyRecurringMinor: number;
  totalBandwidthMbps: number;
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
