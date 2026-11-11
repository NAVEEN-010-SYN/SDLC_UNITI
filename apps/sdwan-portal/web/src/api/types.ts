/** Wire types mirrored from the API's vendor-neutral domain model (api/src/domain/types.ts). */

export type Vendor = 'VELOCLOUD' | 'FORTINET';
export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT' | 'PARTNER_ADMIN' | 'PARTNER_AGENT';
export type EdgeStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type LinkState = 'UP' | 'DOWN' | 'STANDBY' | 'UNKNOWN';
export type Transport = 'FIBRE' | 'BROADBAND' | 'LTE' | 'MPLS' | 'UNKNOWN';
export type Protocol = 'TCP' | 'UDP' | 'ICMP' | 'ANY';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Site {
  id: string;
  name: string;
  vendor: Vendor;
  address: { line1: string; city: string; postcode: string; country: string };
  edgeIds: string[];
}

export interface WanLink {
  id: string;
  edgeId: string;
  name: string;
  interface: string;
  transport: Transport;
  ispName?: string;
  publicIp?: string;
  bandwidthDownKbps: number;
  bandwidthUpKbps: number;
  state: LinkState;
}

export interface Edge {
  id: string;
  siteId: string;
  vendor: Vendor;
  name: string;
  model: string;
  serialNumber: string;
  softwareVersion: string;
  status: EdgeStatus;
  haState: 'STANDALONE' | 'ACTIVE' | 'STANDBY' | 'FAILED';
  lastContact?: string;
  links: WanLink[];
}

export interface InventorySummary {
  sites: number;
  edges: number;
  byStatus: Record<EdgeStatus, number>;
  byVendor: Record<Vendor, number>;
  links: number;
  linksDown: number;
  unavailable: Vendor[];
}

export interface MetricStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface TimeBucket {
  start: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
  samples: number;
}

export interface LinkHealth {
  link: WanLink;
  aggregate: { latencyMs: MetricStats; jitterMs: MetricStats; lossPct: MetricStats; avgRxBps: number; avgTxBps: number } | null;
  score: { score: number; mos: number; grade: 'GOOD' | 'FAIR' | 'POOR' | 'BAD'; slaCompliancePct: number; availabilityPct: number } | null;
  utilisation: { rxP95Pct: number; txP95Pct: number };
  series: TimeBucket[];
}

export interface EdgeHealth {
  range: { from: string; to: string };
  bucketSeconds: number;
  healthScore: number;
  links: LinkHealth[];
  dataSource: 'store' | 'controller';
}

export interface PortRange {
  from: number;
  to: number;
}

export interface BusinessPolicy {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  match: {
    applications?: string[];
    sourceCidrs?: string[];
    destinationCidrs?: string[];
    protocol?: Protocol;
    destinationPorts?: PortRange[];
    dscp?: number;
  };
  action: {
    serviceClass: 'REALTIME' | 'TRANSACTIONAL' | 'BULK';
    priority: 'HIGH' | 'NORMAL' | 'LOW';
    steering: 'BEST_PATH' | 'PREFERRED_TRANSPORT' | 'LOAD_BALANCE' | 'MANDATORY_TRANSPORT';
    preferredTransport?: Transport;
    rateLimitKbps?: number;
    dscpRemark?: number;
  };
}

export interface FirewallRule {
  id: string;
  name: string;
  sequence: number;
  enabled: boolean;
  action: 'ALLOW' | 'DENY';
  protocol: Protocol;
  sourceCidrs: string[];
  destinationCidrs: string[];
  destinationPorts: PortRange[];
  log: boolean;
}

export interface Finding {
  ruleId?: string;
  policyId?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code?: string;
  message: string;
}

export interface PolicyView {
  edgeId: string;
  vendor: Vendor;
  policies: BusinessPolicy[];
  issues: Finding[];
  warnings: Array<{ policyId: string; field: string; message: string }>;
}

export interface FirewallView {
  edgeId: string;
  vendor: Vendor;
  rules: FirewallRule[];
  findings: Finding[];
}

export type AlertSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alert {
  id: string;
  edgeId: string;
  linkId?: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  occurrences: number;
  raisedAt: string;
  lastSeenAt: string;
  acknowledgedBy?: string;
}

export interface SdwanEvent {
  id: string;
  edgeId?: string;
  vendor: Vendor;
  occurredAt: string;
  category: string;
  severity: AlertSeverity;
  message: string;
}

export type ChangeType = 'POLICY_UPDATE' | 'FIREWALL_UPDATE' | 'CONFIG_ROLLBACK' | 'SOFTWARE_UPGRADE' | 'EDGE_REBOOT';
export type ChangeStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ChangePayload =
  | { type: 'POLICY_UPDATE'; policies: BusinessPolicy[] }
  | { type: 'FIREWALL_UPDATE'; rules: FirewallRule[] }
  | { type: 'CONFIG_ROLLBACK'; backupId: string }
  | { type: 'SOFTWARE_UPGRADE'; targetVersion: string }
  | { type: 'EDGE_REBOOT' };

export interface ChangeRequest {
  id: string;
  title: string;
  description?: string;
  type: ChangeType;
  edgeIds: string[];
  payload: ChangePayload;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskReasons: string[];
  emergency: boolean;
  status: ChangeStatus;
  requestedBy: string;
  approvals: Array<{ userId: string; role: Role; decision: 'APPROVE' | 'REJECT'; comment?: string; decidedAt: string }>;
  scheduledFor?: string;
  maintenanceWindowId?: string;
  results: Array<{ edgeId: string; ok: boolean; error?: string; finishedAt: string }>;
  history: Array<{ at: string; by: string; from: ChangeStatus | null; to: ChangeStatus; note?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequestView extends ChangeRequest {
  approvalPolicy: { requiredApprovals: number; requiredRoles: Role[]; requiresMaintenanceWindow: boolean };
  outstanding: string[];
  lintFindings?: Finding[];
}

export interface WindowOccurrence {
  windowId: string;
  name: string;
  start: string;
  end: string;
}

export interface CreateChangeRequest {
  title: string;
  description?: string;
  edgeIds: string[];
  payload: ChangePayload;
  emergency?: boolean;
  submit?: boolean;
}
