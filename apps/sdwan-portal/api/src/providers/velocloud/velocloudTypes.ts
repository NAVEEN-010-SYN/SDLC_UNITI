/**
 * Subset of VeloCloud Orchestrator (VCO) portal API v1 shapes used by the adapter.
 * Field names follow the VCO API exactly; anything not consumed is left out.
 */

export type VcoEdgeState = 'CONNECTED' | 'OFFLINE' | 'DEGRADED' | 'NEVER_ACTIVATED' | 'REACTIVATION_PENDING';
export type VcoHaState = 'UNCONFIGURED' | 'READY' | 'PENDING_INIT' | 'ACTIVE' | 'FAILED' | 'STANDBY';
export type VcoLinkState = 'STABLE' | 'UNSTABLE' | 'DISCONNECTED' | 'STANDBY' | 'QUIET' | 'INITIAL';

export interface VcoSite {
  id: number;
  name: string | null;
  streetAddress: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface VcoLink {
  id: number;
  internalId: string;
  interface: string;
  displayName: string | null;
  isp: string | null;
  ipAddress: string | null;
  networkType: 'ETHERNET' | 'WIRELESS' | 'PRIVATE' | null;
  state: VcoLinkState;
  /** Measured bandwidth in kbps, populated after the edge has run a bandwidth test. */
  bandwidthDownKbps?: number | null;
  bandwidthUpKbps?: number | null;
  /** Free-form tag set by provisioning: "fibre", "mpls", "lte"... */
  linkTag?: string | null;
}

export interface VcoEdge {
  id: number;
  logicalId: string;
  name: string;
  edgeState: VcoEdgeState;
  haState: VcoHaState;
  modelNumber: string;
  serialNumber: string | null;
  softwareVersion: string;
  lastContact: string | null;
  siteId: number;
  site?: VcoSite;
  links?: VcoLink[];
}

export interface VcoMetricSeries {
  metric: 'bestLatencyMsRx' | 'bestJitterMsRx' | 'bestLossPctRx' | 'bytesRx' | 'bytesTx';
  startTime: string;
  /** Milliseconds between successive data points. */
  tickInterval: number;
  data: Array<number | null>;
}

export interface VcoLinkSeries {
  link: { internalId: string; interface: string };
  series: VcoMetricSeries[];
}

/** VCO encodes "any" as -1 and full-match masks as 255.255.255.255. */
export interface VcoRuleMatch {
  appid: number;
  classid: number;
  dscp: number;
  sip: string;
  ssm: string;
  dip: string;
  dsm: string;
  sport_low: number;
  sport_high: number;
  dport_low: number;
  dport_high: number;
  proto: number;
}

export interface VcoQosRule {
  name: string;
  /** Explicit evaluation order; VCO evaluates rules in array order, this mirrors it. */
  ruleOrder?: number;
  disabled?: boolean;
  match: VcoRuleMatch;
  action: {
    routeType: 'edge2Any' | 'edge2Edge' | 'edge2DataCenter' | 'edge2Cloud';
    allowConversion: boolean;
    QoS: {
      type: 'realtime' | 'transactional' | 'bulk';
      rxScheduler: { priority: 'high' | 'normal' | 'low'; bandwidthCapPct: number; queueLen: number };
      txScheduler: { priority: 'high' | 'normal' | 'low'; bandwidthCapPct: number; queueLen: number };
      /** Absolute rate limit in kbps (-1 = none). Portal extension stored alongside the scheduler. */
      rateLimitKbps?: number;
      dscpRemark?: number;
    };
    edge2EdgeRouteAction: {
      linkPolicy: 'auto' | 'fixed' | 'loadBalance';
      wanlinkPolicy?: 'mandatory' | 'preferred' | 'available';
      linkTag?: string;
      serviceGroup: 'ALL' | 'PUBLIC_WIRED' | 'PRIVATE_WIRED' | 'WIRELESS';
    };
  };
}

export interface VcoFirewallRule {
  name: string;
  disabled?: boolean;
  match: VcoRuleMatch;
  action: { allow_or_deny: 'allow' | 'deny' };
  loggingEnabled: boolean;
}

export interface VcoConfigModule {
  id: number;
  name: 'QOS' | 'firewall' | 'deviceSettings' | 'WAN' | 'controlPlane' | 'metaData';
  version: string;
  data: Record<string, unknown>;
}

export interface VcoConfigProfile {
  id: number;
  name: string;
  /** "edgeSpecificProfile" is index 0 in the stack, the enterprise profile follows. */
  configurationType: 'SEGMENT_BASED' | 'NETWORK_BASED';
  modules: VcoConfigModule[];
}

export interface VcoQosModuleData {
  segments: Array<{ segment: { segmentId: number; name: string }; rules: VcoQosRule[] }>;
}

export interface VcoFirewallModuleData {
  firewall_enabled: boolean;
  segments: Array<{ segment: { segmentId: number; name: string }; outbound: VcoFirewallRule[] }>;
}

export interface VcoEvent {
  id: number;
  eventTime: string;
  event: string;
  category: 'EDGE' | 'NETWORK' | 'SYSTEM' | 'FIREWALL' | 'APPLICATION' | 'SECURITY';
  severity: 'EMERGENCY' | 'ALERT' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'NOTICE' | 'INFO' | 'DEBUG';
  message: string;
  edgeName: string | null;
  enterpriseUsername?: string | null;
  detail?: string | null;
}

export interface VcoErrorBody {
  error?: { code: number; message: string };
}
