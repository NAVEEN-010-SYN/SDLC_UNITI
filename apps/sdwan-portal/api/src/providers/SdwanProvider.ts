import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent, Vendor } from '../domain/types';

/**
 * Identifies which tenant inside the vendor controller a call targets and which portal
 * account it belongs to. Built by the service layer from the site/edge record.
 */
export interface ProviderContext {
  accountId: string;
  /** VeloCloud enterpriseId or FortiManager ADOM name. */
  tenant: string;
  correlationId?: string;
}

/** A site as discovered from the controller, before it is linked to a portal record. */
export interface DiscoveredSite {
  vendorId: string;
  name: string;
  address?: { line1: string; city: string; postcode: string; country: string };
  edgeVendorIds: string[];
}

export interface ConfigSnapshot {
  /** Vendor-native configuration document (VCO configuration stack / FortiOS JSON config). */
  content: Record<string, unknown>;
  /** Firmware / config schema version the snapshot came from; restores check compatibility. */
  vendorVersion: string;
}

export interface ApplyResult {
  /** Vendor task / install id, if the controller applies asynchronously. */
  taskId?: string;
  applied: number;
  warnings: string[];
}

export interface TimeRange {
  from: string;
  to: string;
}

/**
 * Contract implemented by every vendor adapter. All methods accept and return the
 * vendor-neutral model; adapters own every bit of vendor-specific mapping, session
 * handling and error translation (to ProblemError subclasses).
 */
export interface SdwanProvider {
  readonly vendor: Vendor;

  listSites(ctx: ProviderContext): Promise<DiscoveredSite[]>;
  listEdges(ctx: ProviderContext): Promise<Edge[]>;
  getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge>;

  getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]>;

  listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]>;
  applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult>;

  listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]>;
  applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult>;

  exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot>;
  restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult>;

  rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult>;
  upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult>;

  listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]>;

  /** Cheap connectivity/auth probe used by /readyz. */
  ping(): Promise<boolean>;
}
