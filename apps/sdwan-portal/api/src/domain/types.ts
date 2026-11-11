/**
 * Vendor-neutral SD-WAN model. Every adapter maps its controller's native objects
 * into these shapes; nothing above the provider layer knows which vendor it is
 * talking to except through the `vendor` discriminator.
 */

export type Vendor = 'VELOCLOUD' | 'FORTINET';

export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT' | 'PARTNER_ADMIN' | 'PARTNER_AGENT';

/** Opaque reference to the object inside the vendor controller (VCO edge id, FortiGate serial, ...). */
export interface VendorRef {
  vendor: Vendor;
  /** VeloCloud enterpriseId or FortiManager ADOM. */
  tenant: string;
  id: string;
}

export interface Site {
  id: string;
  accountId: string;
  name: string;
  address: { line1: string; city: string; postcode: string; country: string };
  vendor: Vendor;
  vendorRef: VendorRef;
  region?: string;
  edgeIds: string[];
}

export type EdgeStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type HaState = 'STANDALONE' | 'ACTIVE' | 'STANDBY' | 'FAILED';
export type Transport = 'FIBRE' | 'BROADBAND' | 'LTE' | 'MPLS' | 'UNKNOWN';
export type LinkState = 'UP' | 'DOWN' | 'STANDBY' | 'UNKNOWN';

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
  accountId: string;
  vendor: Vendor;
  vendorRef: VendorRef;
  name: string;
  model: string;
  serialNumber: string;
  softwareVersion: string;
  status: EdgeStatus;
  haState: HaState;
  lastContact?: string;
  links: WanLink[];
}

/** One measurement interval for one WAN link. */
export interface LinkSample {
  edgeId: string;
  linkId: string;
  timestamp: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
}

export type ServiceClass = 'REALTIME' | 'TRANSACTIONAL' | 'BULK';
export type PolicyPriority = 'HIGH' | 'NORMAL' | 'LOW';
export type SteeringMode = 'BEST_PATH' | 'PREFERRED_TRANSPORT' | 'LOAD_BALANCE' | 'MANDATORY_TRANSPORT';

export interface SlaThresholds {
  maxLatencyMs: number;
  maxJitterMs: number;
  maxLossPct: number;
}

export interface PolicyMatch {
  applications?: string[];
  sourceCidrs?: string[];
  destinationCidrs?: string[];
  protocol?: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  destinationPorts?: PortRange[];
  dscp?: number;
}

export interface PortRange {
  from: number;
  to: number;
}

export interface BusinessPolicy {
  id: string;
  name: string;
  /** Lower number = evaluated first. */
  order: number;
  enabled: boolean;
  match: PolicyMatch;
  action: {
    serviceClass: ServiceClass;
    priority: PolicyPriority;
    steering: SteeringMode;
    preferredTransport?: Transport;
    sla?: SlaThresholds;
    rateLimitKbps?: number;
    dscpRemark?: number;
  };
}

export type FirewallAction = 'ALLOW' | 'DENY';

export interface FirewallRule {
  id: string;
  name: string;
  sequence: number;
  enabled: boolean;
  action: FirewallAction;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  sourceCidrs: string[];
  destinationCidrs: string[];
  destinationPorts: PortRange[];
  log: boolean;
}

export type ChangeType =
  | 'POLICY_UPDATE'
  | 'FIREWALL_UPDATE'
  | 'CONFIG_ROLLBACK'
  | 'SOFTWARE_UPGRADE'
  | 'EDGE_REBOOT';

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

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Approval {
  userId: string;
  role: Role;
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
  decidedAt: string;
}

export interface ChangeHistoryEntry {
  at: string;
  by: string;
  from: ChangeStatus | null;
  to: ChangeStatus;
  note?: string;
}

export type ChangePayload =
  | { type: 'POLICY_UPDATE'; policies: BusinessPolicy[] }
  | { type: 'FIREWALL_UPDATE'; rules: FirewallRule[] }
  | { type: 'CONFIG_ROLLBACK'; backupId: string }
  | { type: 'SOFTWARE_UPGRADE'; targetVersion: string }
  | { type: 'EDGE_REBOOT' };

export interface ChangeExecutionResult {
  edgeId: string;
  ok: boolean;
  backupId?: string;
  error?: string;
  finishedAt: string;
}

export interface ChangeRequest {
  id: string;
  accountId: string;
  title: string;
  description?: string;
  type: ChangeType;
  edgeIds: string[];
  payload: ChangePayload;
  risk: RiskLevel;
  riskReasons: string[];
  emergency: boolean;
  status: ChangeStatus;
  requestedBy: string;
  requestedByRole: Role;
  approvals: Approval[];
  maintenanceWindowId?: string;
  scheduledFor?: string;
  results: ChangeExecutionResult[];
  history: ChangeHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWindow {
  id: string;
  accountId: string;
  name: string;
  /** 0 = Sunday ... 6 = Saturday, in UTC. */
  daysOfWeek: number[];
  /** HH:mm UTC. */
  startTime: string;
  durationMinutes: number;
  /** Optional blackout dates (YYYY-MM-DD) where the window does not open. */
  blackoutDates: string[];
}

export interface ConfigBackup {
  id: string;
  accountId: string;
  edgeId: string;
  vendor: Vendor;
  takenAt: string;
  takenBy: string;
  reason: 'MANUAL' | 'PRE_CHANGE' | 'SCHEDULED';
  changeRequestId?: string;
  checksum: string;
  sizeBytes: number;
  vendorVersion: string;
  content: Record<string, unknown>;
}

export type AlertSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlertType =
  | 'EDGE_DOWN'
  | 'LINK_DOWN'
  | 'HIGH_LATENCY'
  | 'HIGH_JITTER'
  | 'HIGH_LOSS'
  | 'SLA_BREACH'
  | 'HA_FAILOVER'
  | 'CONFIG_CHANGE';

export interface Alert {
  id: string;
  accountId: string;
  edgeId: string;
  linkId?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  /** Key used to de-duplicate repeated raises of the same condition. */
  fingerprint: string;
  occurrences: number;
  raisedAt: string;
  lastSeenAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface SdwanEvent {
  id: string;
  accountId: string;
  edgeId?: string;
  vendor: Vendor;
  occurredAt: string;
  category: 'EDGE' | 'LINK' | 'CONFIG' | 'SECURITY' | 'SYSTEM';
  severity: AlertSeverity;
  message: string;
  raw?: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Principal {
  userId: string;
  roles: Role[];
  /** Business users are bound to one account; support agents may carry none. */
  accountId?: string;
  partnerAccountIds?: string[];
}
