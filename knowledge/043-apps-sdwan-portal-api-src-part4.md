# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src (part 4 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 16

## Files

- `apps/sdwan-portal/api/src/providers/velocloud/velocloudMappers.ts` (486 lines)
- `apps/sdwan-portal/api/src/providers/velocloud/velocloudTypes.ts` (152 lines)
- `apps/sdwan-portal/api/src/repositories/InMemoryRepository.ts` (75 lines)
- `apps/sdwan-portal/api/src/repositories/MetricsStore.ts` (100 lines)
- `apps/sdwan-portal/api/src/repositories/index.ts` (65 lines)
- `apps/sdwan-portal/api/src/routes/changeRoutes.ts` (49 lines)
- `apps/sdwan-portal/api/src/routes/configRoutes.ts` (47 lines)
- `apps/sdwan-portal/api/src/routes/inventoryRoutes.ts` (80 lines)
- `apps/sdwan-portal/api/src/routes/operationsRoutes.ts` (84 lines)
- `apps/sdwan-portal/api/src/routes/params.ts` (5 lines)
- `apps/sdwan-portal/api/src/server.ts` (44 lines)
- `apps/sdwan-portal/api/src/services/AlertService.test.ts` (102 lines)
- `apps/sdwan-portal/api/src/services/AlertService.ts` (209 lines)
- `apps/sdwan-portal/api/src/services/BackupService.test.ts` (52 lines)
- `apps/sdwan-portal/api/src/services/BackupService.ts` (145 lines)
- `apps/sdwan-portal/api/src/services/ChangeRequestService.test.ts` (147 lines)

## apps/sdwan-portal/api/src/providers/velocloud/velocloudMappers.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/velocloud/velocloudMappers.ts`.

```typescript
import type {
  BusinessPolicy,
  Edge,
  EdgeStatus,
  FirewallRule,
  HaState,
  LinkSample,
  LinkState,
  PolicyPriority,
  PortRange,
  SdwanEvent,
  AlertSeverity,
  ServiceClass,
  SteeringMode,
  Transport,
  WanLink,
} from '../../domain/types';
import { parseCidr, intToIp, netmaskToPrefix, prefixToNetmask } from '../../domain/cidr';
import { deriveEdgeStatus } from '../../domain/linkScoring';
import { defaultPriorityFor } from '../../domain/policyTranslation';
import { applicationByKey, applicationByVelocloudId } from '../applicationCatalog';
import type {
  VcoEdge,
  VcoEdgeState,
  VcoEvent,
  VcoFirewallRule,
  VcoHaState,
  VcoLink,
  VcoLinkSeries,
  VcoLinkState,
  VcoQosRule,
  VcoRuleMatch,
} from './velocloudTypes';

export const VCO_ANY = -1;
const FULL_MASK = '255.255.255.255';

const PROTO_TO_NUM: Record<string, number> = { TCP: 6, UDP: 17, ICMP: 1, ANY: VCO_ANY };
const NUM_TO_PROTO: Record<number, FirewallRule['protocol']> = { 6: 'TCP', 17: 'UDP', 1: 'ICMP' };

export function mapEdgeState(state: VcoEdgeState): EdgeStatus {
  switch (state) {
    case 'CONNECTED':
      return 'UP';
    case 'DEGRADED':
      return 'DEGRADED';
    case 'OFFLINE':
      return 'DOWN';
    default:
      return 'UNKNOWN';
  }
}

export function mapHaState(state: VcoHaState): HaState {
  switch (state) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'STANDBY':
    case 'READY':
      return 'STANDBY';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'STANDALONE';
  }
}

export function mapLinkState(state: VcoLinkState): LinkState {
  switch (state) {
    case 'STABLE':
    case 'UNSTABLE':
      return 'UP';
    case 'STANDBY':
    case 'QUIET':
      return 'STANDBY';
    case 'DISCONNECTED':
      return 'DOWN';
    default:
      return 'UNKNOWN';
  }
}

/** VCO only distinguishes wired/wireless/private; the provisioning tag tells us fibre vs broadband. */
export function mapTransport(link: Pick<VcoLink, 'networkType' | 'linkTag'>): Transport {
  const tag = (link.linkTag ?? '').toLowerCase();
  if (link.networkType === 'WIRELESS' || tag.includes('lte') || tag.includes('5g')) return 'LTE';
  if (link.networkType === 'PRIVATE' || tag.includes('mpls')) return 'MPLS';
  if (tag.includes('fibre') || tag.includes('fiber') || tag.includes('ftth')) return 'FIBRE';
  if (tag.includes('broadband') || tag.includes('dsl') || tag.includes('fttc')) return 'BROADBAND';
  return link.networkType === 'ETHERNET' ? 'BROADBAND' : 'UNKNOWN';
}

export function edgeIdFor(tenant: string, logicalId: string): string {
  return `vc-${tenant}-${logicalId}`;
}

export function mapLink(edgeId: string, link: VcoLink): WanLink {
  return {
    id: `${edgeId}:${link.internalId}`,
    edgeId,
    name: link.displayName ?? link.interface,
    interface: link.interface,
    transport: mapTransport(link),
    ispName: link.isp ?? undefined,
    publicIp: link.ipAddress ?? undefined,
    bandwidthDownKbps: link.bandwidthDownKbps ?? 0,
    bandwidthUpKbps: link.bandwidthUpKbps ?? 0,
    state: mapLinkState(link.state),
  };
}

export function mapEdge(tenant: string, accountId: string, siteId: string, vco: VcoEdge): Edge {
  const id = edgeIdFor(tenant, vco.logicalId);
  const links = (vco.links ?? []).map((l) => mapLink(id, l));
  return {
    id,
    siteId,
    accountId,
    vendor: 'VELOCLOUD',
    vendorRef: { vendor: 'VELOCLOUD', tenant, id: String(vco.id) },
    name: vco.name,
    model: vco.modelNumber,
    serialNumber: vco.serialNumber ?? '',
    softwareVersion: vco.softwareVersion,
    status: deriveEdgeStatus(mapEdgeState(vco.edgeState), links.map((l) => l.state)),
    haState: mapHaState(vco.haState),
    lastContact: vco.lastContact ? new Date(vco.lastContact).toISOString() : undefined,
    links,
  };
}

/**
 * Converts VCO per-link metric series into neutral samples. VCO returns one series per
 * metric with a start time and tick interval; we zip them by index. bytesRx/bytesTx are
 * per-tick totals and are converted to bits per second.
 */
export function mapLinkSeries(edgeId: string, series: VcoLinkSeries[]): LinkSample[] {
  const out: LinkSample[] = [];
  for (const ls of series) {
    const byMetric = new Map(ls.series.map((s) => [s.metric, s]));
    const anchor = byMetric.get('bestLatencyMsRx') ?? ls.series[0];
    if (!anchor) continue;
    const start = Date.parse(anchor.startTime);
    const tickSec = anchor.tickInterval / 1000;
    for (let i = 0; i < anchor.data.length; i++) {
      const pick = (m: Parameters<typeof byMetric.get>[0]) => byMetric.get(m)?.data[i] ?? null;
      const latency = pick('bestLatencyMsRx');
      const jitter = pick('bestJitterMsRx');
      const loss = pick('bestLossPctRx');
      if (latency === null || jitter === null || loss === null) continue;
      const rxBytes = pick('bytesRx') ?? 0;
      const txBytes = pick('bytesTx') ?? 0;
      out.push({
        edgeId,
        linkId: `${edgeId}:${ls.link.internalId}`,
        timestamp: new Date(start + i * anchor.tickInterval).toISOString(),
        latencyMs: latency,
        jitterMs: jitter,
        lossPct: loss,
        rxBps: tickSec > 0 ? Math.round((rxBytes * 8) / tickSec) : 0,
        txBps: tickSec > 0 ? Math.round((txBytes * 8) / tickSec) : 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Match translation
// ---------------------------------------------------------------------------

interface AddrMask {
  ip: string;
  mask: string;
}

function cidrToVco(cidr: string | undefined): AddrMask {
  if (!cidr) return { ip: 'any', mask: FULL_MASK };
  const range = parseCidr(cidr);
  if (range.start === 0 && range.end === 0xffffffff) return { ip: 'any', mask: FULL_MASK };
  const prefix = 32 - Math.log2(range.end - range.start + 1);
  return { ip: intToIp(range.start), mask: prefixToNetmask(prefix) };
}

function vcoToCidr(ip: string, mask: string): string | undefined {
  if (!ip || ip === 'any') return undefined;
  return `${ip}/${netmaskToPrefix(mask || FULL_MASK)}`;
}

function blankMatch(): VcoRuleMatch {
  return {
    appid: VCO_ANY,
    classid: VCO_ANY,
    dscp: VCO_ANY,
    sip: 'any',
    ssm: FULL_MASK,
    dip: 'any',
    dsm: FULL_MASK,
    sport_low: VCO_ANY,
    sport_high: VCO_ANY,
    dport_low: VCO_ANY,
    dport_high: VCO_ANY,
    proto: VCO_ANY,
  };
}

interface ExpandInput {
  applications?: string[];
  sourceCidrs?: string[];
  destinationCidrs?: string[];
  protocol?: string;
  destinationPorts?: PortRange[];
  dscp?: number;
}

/**
 * A VCO rule matches a single app, a single source/destination subnet and a single
 * port range. A neutral rule with lists expands into the cartesian product; each
 * expanded VCO rule is named "<name>#<n>" so it can be folded back on read.
 */
export function expandMatch(m: ExpandInput): VcoRuleMatch[] {
  const apps = m.applications?.length ? m.applications : [undefined];
  const srcs = m.sourceCidrs?.length ? m.sourceCidrs : [undefined];
  const dsts = m.destinationCidrs?.length ? m.destinationCidrs : [undefined];
  const ports: Array<PortRange | undefined> = m.destinationPorts?.length ? m.destinationPorts : [undefined];
  const out: VcoRuleMatch[] = [];
  for (const app of apps) {
    for (const s of srcs) {
      for (const d of dsts) {
        for (const p of ports) {
          const src = cidrToVco(s);
          const dst = cidrToVco(d);
          const appDef = app ? applicationByKey(app) : undefined;
          if (app && !appDef) throw new Error(`application "${app}" is not in the catalogue`);
          out.push({
            ...blankMatch(),
            appid: appDef ? appDef.velocloudAppId : VCO_ANY,
            dscp: m.dscp ?? VCO_ANY,
            sip: src.ip,
            ssm: src.mask,
            dip: dst.ip,
            dsm: dst.mask,
            dport_low: p ? p.from : VCO_ANY,
            dport_high: p ? p.to : VCO_ANY,
            proto: PROTO_TO_NUM[m.protocol ?? 'ANY'] ?? VCO_ANY,
          });
        }
      }
    }
  }
  return out;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** Folds a group of expanded VCO matches back into one neutral match. */
export function foldMatches(matches: VcoRuleMatch[]): ExpandInput & { protocol: FirewallRule['protocol'] } {
  const apps = uniq(matches.map((m) => m.appid).filter((id) => id !== VCO_ANY))
    .map((id) => applicationByVelocloudId(id)?.key ?? `vco-app-${id}`);
  const srcs = uniq(matches.map((m) => vcoToCidr(m.sip, m.ssm)).filter((c): c is string => !!c));
  const dsts = uniq(matches.map((m) => vcoToCidr(m.dip, m.dsm)).filter((c): c is string => !!c));
  const portKeys = uniq(
    matches.filter((m) => m.dport_low !== VCO_ANY).map((m) => `${m.dport_low}-${m.dport_high === VCO_ANY ? m.dport_low : m.dport_high}`),
  );
  const dscp = matches.find((m) => m.dscp !== VCO_ANY)?.dscp;
  return {
    applications: apps.length ? apps : undefined,
    sourceCidrs: srcs.length ? srcs : undefined,
    destinationCidrs: dsts.length ? dsts : undefined,
    destinationPorts: portKeys.length
      ? portKeys.map((k) => {
          const [from, to] = k.split('-').map(Number);
          return { from, to };
        })
      : undefined,
    protocol: NUM_TO_PROTO[matches[0]?.proto] ?? 'ANY',
    dscp,
  };
}

/** Groups VCO rules named "base#n" by base name, preserving first-seen order. */
export function groupExpanded<T extends { name: string }>(rules: T[]): Array<{ name: string; index: number; members: T[] }> {
  const groups = new Map<string, { name: string; index: number; members: T[] }>();
  rules.forEach((r, i) => {
    const base = r.name.replace(/#\d+$/, '');
    const g = groups.get(base);
    if (g) g.members.push(r);
    else groups.set(base, { name: base, index: i, members: [r] });
  });
  return [...groups.values()];
}

function expandedName(base: string, i: number, total: number): string {
  return total === 1 ? base : `${base}#${i + 1}`;
}

// ---------------------------------------------------------------------------
// Business policy translation
// ---------------------------------------------------------------------------

const CLASS_TO_VCO: Record<ServiceClass, VcoQosRule['action']['QoS']['type']> = {
  REALTIME: 'realtime',
  TRANSACTIONAL: 'transactional',
  BULK: 'bulk',
};

const PRIORITY_TO_VCO: Record<PolicyPriority, 'high' | 'normal' | 'low'> = { HIGH: 'high', NORMAL: 'normal', LOW: 'low' };

function steeringToVco(policy: BusinessPolicy): VcoQosRule['action']['edge2EdgeRouteAction'] {
  const tag = policy.action.preferredTransport?.toLowerCase();
  switch (policy.action.steering) {
    case 'BEST_PATH':
      return { linkPolicy: 'auto', serviceGroup: 'ALL' };
    case 'LOAD_BALANCE':
      return { linkPolicy: 'loadBalance', serviceGroup: 'ALL' };
    case 'PREFERRED_TRANSPORT':
      return { linkPolicy: 'fixed', wanlinkPolicy: 'preferred', linkTag: tag, serviceGroup: 'ALL' };
    case 'MANDATORY_TRANSPORT':
      return { linkPolicy: 'fixed', wanlinkPolicy: 'mandatory', linkTag: tag, serviceGroup: 'ALL' };
  }
}

function steeringFromVco(r: VcoQosRule['action']['edge2EdgeRouteAction']): { steering: SteeringMode; preferredTransport?: Transport } {
  if (r.linkPolicy === 'loadBalance') return { steering: 'LOAD_BALANCE' };
  if (r.linkPolicy === 'auto') return { steering: 'BEST_PATH' };
  const transport = r.linkTag ? mapTransport({ networkType: null, linkTag: r.linkTag }) : undefined;
  return {
    steering: r.wanlinkPolicy === 'mandatory' ? 'MANDATORY_TRANSPORT' : 'PREFERRED_TRANSPORT',
    preferredTransport: transport && transport !== 'UNKNOWN' ? transport : undefined,
  };
}

export function policiesToVco(policies: BusinessPolicy[]): VcoQosRule[] {
  const ordered = [...policies].sort((a, b) => a.order - b.order);
  const rules: VcoQosRule[] = [];
  for (const p of ordered) {
    const matches = expandMatch(p.match);
    const scheduler = { priority: PRIORITY_TO_VCO[p.action.priority], bandwidthCapPct: VCO_ANY, queueLen: VCO_ANY };
    matches.forEach((match, i) => {
      rules.push({
        name: expandedName(p.name, i, matches.length),
        ruleOrder: rules.length,
        disabled: !p.enabled,
        match,
        action: {
          routeType: 'edge2Any',
          allowConversion: true,
          QoS: {
            type: CLASS_TO_VCO[p.action.serviceClass],
            rxScheduler: scheduler,
            txScheduler: scheduler,
            rateLimitKbps: p.action.rateLimitKbps ?? VCO_ANY,
            dscpRemark: p.action.dscpRemark,
          },
          edge2EdgeRouteAction: steeringToVco(p),
        },
      });
    });
  }
  return rules;
}

export function policiesFromVco(rules: VcoQosRule[]): BusinessPolicy[] {
  return groupExpanded(rules).map((group, i) => {
    const first = group.members[0];
    const cls = (Object.keys(CLASS_TO_VCO) as ServiceClass[]).find((k) => CLASS_TO_VCO[k] === first.action.QoS.type) ?? 'TRANSACTIONAL';
    const prioEntry = Object.entries(PRIORITY_TO_VCO).find(([, v]) => v === first.action.QoS.rxScheduler.priority);
    const folded = foldMatches(group.members.map((m) => m.match));
    const rate = first.action.QoS.rateLimitKbps;
    return {
      id: `vco-qos-${slug(group.name)}`,
      name: group.name,
      order: (i + 1) * 10,
      enabled: !first.disabled,
      match: { ...folded, protocol: folded.protocol },
      action: {
        serviceClass: cls,
        priority: (prioEntry?.[0] as PolicyPriority) ?? defaultPriorityFor(cls),
        ...steeringFromVco(first.action.edge2EdgeRouteAction),
        rateLimitKbps: rate !== undefined && rate !== VCO_ANY ? rate : undefined,
        dscpRemark: first.action.QoS.dscpRemark,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Firewall translation
// ---------------------------------------------------------------------------

export function firewallToVco(rules: FirewallRule[]): VcoFirewallRule[] {
  const out: VcoFirewallRule[] = [];
  for (const r of [...rules].sort((a, b) => a.sequence - b.sequence)) {
    const matches = expandMatch({
      sourceCidrs: r.sourceCidrs,
      destinationCidrs: r.destinationCidrs,
      destinationPorts: r.protocol === 'ICMP' ? [] : r.destinationPorts,
      protocol: r.protocol,
    });
    matches.forEach((match, i) =>
      out.push({
        name: expandedName(r.name, i, matches.length),
        disabled: !r.enabled,
        match,
        action: { allow_or_deny: r.action === 'ALLOW' ? 'allow' : 'deny' },
        loggingEnabled: r.log,
      }),
    );
  }
  return out;
}

export function firewallFromVco(rules: VcoFirewallRule[]): FirewallRule[] {
  return groupExpanded(rules).map((group, i) => {
    const first = group.members[0];
    const folded = foldMatches(group.members.map((m) => m.match));
    return {
      id: `vco-fw-${slug(group.name)}`,
      name: group.name,
      sequence: (i + 1) * 10,
      enabled: !first.disabled,
      action: first.action.allow_or_deny === 'allow' ? 'ALLOW' : 'DENY',
      protocol: folded.protocol,
      sourceCidrs: folded.sourceCidrs ?? [],
      destinationCidrs: folded.destinationCidrs ?? [],
      destinationPorts: folded.destinationPorts ?? [],
      log: first.loggingEnabled,
    };
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function mapEventSeverity(sev: VcoEvent['severity']): AlertSeverity {
  switch (sev) {
    case 'EMERGENCY':
    case 'ALERT':
    case 'CRITICAL':
      return 'CRITICAL';
    case 'ERROR':
      return 'MAJOR';
    case 'WARNING':
      return 'MINOR';
    default:
      return 'INFO';
  }
}

export function mapEventCategory(cat: VcoEvent['category']): SdwanEvent['category'] {
  switch (cat) {
    case 'EDGE':
      return 'EDGE';
    case 'NETWORK':
      return 'LINK';
    case 'FIREWALL':
    case 'SECURITY':
      return 'SECURITY';
    default:
      return 'SYSTEM';
  }
}

export function mapEvent(tenant: string, accountId: string, ev: VcoEvent, edgeIdByName: Map<string, string>): SdwanEvent {
  const category = /CONFIG/i.test(ev.event) ? 'CONFIG' : mapEventCategory(ev.category);
  return {
    id: `vc-${tenant}-ev-${ev.id}`,
    accountId,
    edgeId: ev.edgeName ? edgeIdByName.get(ev.edgeName) : undefined,
    vendor: 'VELOCLOUD',
    occurredAt: new Date(ev.eventTime).toISOString(),
    category,
    severity: mapEventSeverity(ev.severity),
    message: ev.message,
    raw: { event: ev.event, detail: ev.detail ?? undefined },
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

## apps/sdwan-portal/api/src/providers/velocloud/velocloudTypes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/velocloud/velocloudTypes.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/repositories/InMemoryRepository.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/repositories/InMemoryRepository.ts`.

```typescript
import type { Page } from '../domain/types';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  insert(item: T): Promise<T>;
  /**
   * Optimistic update: `expectedUpdatedAt` must match the stored value (when the entity
   * carries `updatedAt`), otherwise the update is rejected so two approvers acting at
   * once cannot overwrite each other.
   */
  update(item: T, expectedUpdatedAt?: string): Promise<T>;
  delete(id: string): Promise<boolean>;
  find(predicate: (item: T) => boolean, sort?: (a: T, b: T) => number): Promise<T[]>;
  page(predicate: (item: T) => boolean, req: PageRequest, sort?: (a: T, b: T) => number): Promise<Page<T>>;
}

export class ConcurrentModificationError extends Error {
  constructor(id: string) {
    super(`entity ${id} was modified by another request`);
  }
}

export function paginate<T>(items: T[], req: PageRequest): Page<T> {
  const start = (req.page - 1) * req.pageSize;
  return { items: items.slice(start, start + req.pageSize), page: req.page, pageSize: req.pageSize, total: items.length };
}

/**
 * Map-backed repository. Values are deep-cloned on the way in and out so callers can
 * never mutate stored state without going through update(). A database-backed
 * implementation only needs to satisfy the Repository interface.
 */
export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  protected readonly items = new Map<string, T>();

  async get(id: string): Promise<T | undefined> {
    const v = this.items.get(id);
    return v ? structuredClone(v) : undefined;
  }

  async insert(item: T): Promise<T> {
    if (this.items.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async update(item: T, expectedUpdatedAt?: string): Promise<T> {
    const current = this.items.get(item.id) as (T & { updatedAt?: string }) | undefined;
    if (!current) throw new Error(`entity ${item.id} does not exist`);
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw new ConcurrentModificationError(item.id);
    }
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async find(predicate: (item: T) => boolean, sort?: (a: T, b: T) => number): Promise<T[]> {
    const out = [...this.items.values()].filter(predicate).map((v) => structuredClone(v));
    return sort ? out.sort(sort) : out;
  }

  async page(predicate: (item: T) => boolean, req: PageRequest, sort?: (a: T, b: T) => number): Promise<Page<T>> {
    return paginate(await this.find(predicate, sort), req);
  }
}
```

## apps/sdwan-portal/api/src/repositories/MetricsStore.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/repositories/MetricsStore.ts`.

```typescript
import type { LinkSample } from '../domain/types';

/**
 * Time-series store for polled link samples, keyed by link. Samples are kept sorted by
 * timestamp; duplicate timestamps (a re-poll of an overlapping window) replace the
 * earlier value instead of double counting. Old samples are pruned on write.
 */
export class MetricsStore {
  private readonly series = new Map<string, LinkSample[]>();

  constructor(
    private readonly retentionMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  append(samples: LinkSample[]): number {
    const cutoff = this.now() - this.retentionMs;
    let added = 0;
    const touched = new Set<string>();
    for (const s of samples) {
      const ts = Date.parse(s.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      let list = this.series.get(s.linkId);
      if (!list) {
        list = [];
        this.series.set(s.linkId, list);
      }
      const idx = this.lowerBound(list, s.timestamp);
      if (idx < list.length && list[idx].timestamp === s.timestamp) {
        list[idx] = s;
      } else {
        list.splice(idx, 0, s);
        added++;
      }
      touched.add(s.linkId);
    }
    for (const linkId of touched) this.prune(linkId, cutoff);
    return added;
  }

  query(linkIds: string[], fromIso: string, toIso: string): LinkSample[] {
    const out: LinkSample[] = [];
    for (const id of linkIds) {
      const list = this.series.get(id);
      if (!list) continue;
      let i = this.lowerBound(list, fromIso);
      while (i < list.length && list[i].timestamp <= toIso) out.push(list[i++]);
    }
    return out;
  }

  queryEdge(edgeId: string, fromIso: string, toIso: string): LinkSample[] {
    const ids = [...this.series.keys()].filter((k) => k.startsWith(`${edgeId}:`));
    return this.query(ids, fromIso, toIso);
  }

  latest(linkId: string): LinkSample | undefined {
    const list = this.series.get(linkId);
    return list?.[list.length - 1];
  }

  /** Timestamp of the newest sample for the edge, used by the poller to fetch incrementally. */
  lastTimestampForEdge(edgeId: string): string | undefined {
    let max: string | undefined;
    for (const [k, list] of this.series) {
      if (!k.startsWith(`${edgeId}:`) || list.length === 0) continue;
      const t = list[list.length - 1].timestamp;
      if (!max || t > max) max = t;
    }
    return max;
  }

  size(): number {
    let n = 0;
    for (const list of this.series.values()) n += list.length;
    return n;
  }

  private prune(linkId: string, cutoffMs: number): void {
    const list = this.series.get(linkId);
    if (!list) return;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const idx = this.lowerBound(list, cutoffIso);
    if (idx > 0) list.splice(0, idx);
    if (list.length === 0) this.series.delete(linkId);
  }

  /** ISO-8601 UTC strings sort lexicographically in time order. */
  private lowerBound(list: LinkSample[], ts: string): number {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].timestamp < ts) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
```

## apps/sdwan-portal/api/src/repositories/index.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/repositories/index.ts`.

```typescript
import type { Alert, ChangeRequest, ConfigBackup, MaintenanceWindow, Vendor } from '../domain/types';
import { InMemoryRepository } from './InMemoryRepository';
import { MetricsStore } from './MetricsStore';

export class ChangeRequestRepository extends InMemoryRepository<ChangeRequest> {}
export class BackupRepository extends InMemoryRepository<ConfigBackup> {}
export class MaintenanceWindowRepository extends InMemoryRepository<MaintenanceWindow> {}

export class AlertRepository extends InMemoryRepository<Alert> {
  async findOpenByFingerprint(fingerprint: string): Promise<Alert | undefined> {
    const [hit] = await this.find((a) => a.fingerprint === fingerprint && a.status !== 'RESOLVED');
    return hit;
  }
}

/** Links a portal Account to the tenants that hold its SD-WAN estate in each controller. */
export interface AccountTenant {
  accountId: string;
  vendor: Vendor;
  /** VeloCloud enterpriseId or FortiManager ADOM. */
  tenant: string;
}

export class TenantDirectory {
  private readonly byAccount = new Map<string, AccountTenant[]>();

  constructor(entries: AccountTenant[] = []) {
    for (const e of entries) this.add(e);
  }

  add(entry: AccountTenant): void {
    const list = this.byAccount.get(entry.accountId) ?? [];
    if (!list.some((t) => t.vendor === entry.vendor && t.tenant === entry.tenant)) list.push(entry);
    this.byAccount.set(entry.accountId, list);
  }

  tenantsFor(accountId: string): AccountTenant[] {
    return this.byAccount.get(accountId) ?? [];
  }

  accounts(): string[] {
    return [...this.byAccount.keys()];
  }
}

export interface Repositories {
  changeRequests: ChangeRequestRepository;
  backups: BackupRepository;
  maintenanceWindows: MaintenanceWindowRepository;
  alerts: AlertRepository;
  metrics: MetricsStore;
  tenants: TenantDirectory;
}

export function createRepositories(retentionHours: number, tenants: AccountTenant[], now: () => number = Date.now): Repositories {
  return {
    changeRequests: new ChangeRequestRepository(),
    backups: new BackupRepository(),
    maintenanceWindows: new MaintenanceWindowRepository(),
    alerts: new AlertRepository(),
    metrics: new MetricsStore(retentionHours * 3_600_000, now),
    tenants: new TenantDirectory(tenants),
  };
}
```

## apps/sdwan-portal/api/src/routes/changeRoutes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/routes/changeRoutes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { changeQuerySchema, createChangeRequestSchema, decisionSchema, scheduleSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export function changeRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/', requirePermission('change:read'), asyncHandler(async (req, res) => {
    res.json(await c.changes.list(req.params.accountId, parse(changeQuerySchema, req.query)));
  }));

  r.post('/', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const cr = await c.changes.create(principalOf(res.locals), req.params.accountId, parse(createChangeRequestSchema, req.body));
    res.status(201).location(`${req.baseUrl}/${cr.id}`).json(cr);
  }));

  r.get('/:id', requirePermission('change:read'), asyncHandler(async (req, res) => {
    res.json(await c.changes.get(req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.post('/:id/submit', requirePermission('change:create'), asyncHandler(async (req, res) => {
    res.json(await c.changes.submit(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.post('/:id/decisions', requirePermission('change:approve'), asyncHandler(async (req, res) => {
    const decision = parse(decisionSchema, req.body);
    res.json(await c.changes.decide(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), decision));
  }));

  r.post('/:id/schedule', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const body = parse(scheduleSchema, req.body);
    res.json(await c.changes.schedule(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), body));
  }));

  r.post('/:id/cancel', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const { reason } = parse(cancelBody, req.body ?? {});
    res.json(await c.changes.cancel(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), reason));
  }));

  return r;
}
```

## apps/sdwan-portal/api/src/routes/configRoutes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/routes/configRoutes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { APPLICATIONS } from '../providers/applicationCatalog';
import { businessPolicySchema, firewallRuleSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const policyPreviewBody = z
  .object({ edgeIds: z.array(idParam).min(1).max(100), policies: z.array(businessPolicySchema).max(500) })
  .strict();

const firewallPreviewBody = z.object({ rules: z.array(firewallRuleSchema).max(1000) }).strict();

export function configRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/applications', requirePermission('policy:read'), (_req, res) => {
    res.json(APPLICATIONS.map(({ key, label, category }) => ({ key, label, category })));
  });

  r.get('/edges/:edgeId/policies', requirePermission('policy:read'), asyncHandler(async (req, res) => {
    res.json(await c.edgeConfig.policies(req.params.accountId, parse(idParam, req.params.edgeId)));
  }));

  r.get('/edges/:edgeId/firewall-rules', requirePermission('firewall:read'), asyncHandler(async (req, res) => {
    res.json(await c.edgeConfig.firewall(req.params.accountId, parse(idParam, req.params.edgeId)));
  }));

  r.post('/policies/preview', requirePermission('policy:read'), asyncHandler(async (req, res) => {
    const body = parse(policyPreviewBody, req.body);
    res.json(await c.edgeConfig.previewPolicies(req.params.accountId, body.edgeIds, body.policies));
  }));

  r.post('/firewall-rules/preview', requirePermission('firewall:read'), (req, res, next) => {
    try {
      res.json(c.edgeConfig.previewFirewall(parse(firewallPreviewBody, req.body).rules));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
```

## apps/sdwan-portal/api/src/routes/inventoryRoutes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/routes/inventoryRoutes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { paginate } from '../repositories/InMemoryRepository';
import { paginationQuery, timeRangeQuery } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const edgeListQuery = paginationQuery.extend({
  siteId: z.string().max(200).optional(),
  status: z.enum(['UP', 'DEGRADED', 'DOWN', 'UNKNOWN']).optional(),
  vendor: z.enum(['VELOCLOUD', 'FORTINET']).optional(),
  q: z.string().trim().max(100).optional(),
});

const eventsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  edgeId: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function inventoryRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });
  const canRead = requirePermission('inventory:read');

  r.get('/summary', canRead, asyncHandler(async (req, res) => {
    res.json(await c.inventory.summary(req.params.accountId));
  }));

  r.post('/inventory/refresh', canRead, asyncHandler(async (req, res) => {
    const inv = await c.inventory.inventory(req.params.accountId, { refresh: true });
    res.json({ fetchedAt: inv.fetchedAt, sites: inv.sites.length, edges: inv.edges.length, unavailable: inv.unavailable });
  }));

  r.get('/sites', canRead, asyncHandler(async (req, res) => {
    const page = parse(paginationQuery, req.query);
    res.json(paginate(await c.inventory.listSites(req.params.accountId), page));
  }));

  r.get('/sites/:siteId', canRead, asyncHandler(async (req, res) => {
    res.json(await c.inventory.getSite(req.params.accountId, parse(idParam, req.params.siteId)));
  }));

  r.get('/edges', canRead, asyncHandler(async (req, res) => {
    const q = parse(edgeListQuery, req.query);
    const needle = q.q?.toLowerCase();
    const edges = (await c.inventory.listEdges(req.params.accountId, { siteId: q.siteId, status: q.status })).filter(
      (e) =>
        (!q.vendor || e.vendor === q.vendor) &&
        (!needle || e.name.toLowerCase().includes(needle) || e.serialNumber.toLowerCase().includes(needle)),
    );
    res.json(paginate(edges, q));
  }));

  r.get('/edges/:edgeId', canRead, asyncHandler(async (req, res) => {
    const { edge } = await c.inventory.resolveEdge(req.params.accountId, parse(idParam, req.params.edgeId));
    res.json(edge);
  }));

  r.get('/edges/:edgeId/health', requirePermission('health:read'), asyncHandler(async (req, res) => {
    const range = parse(timeRangeQuery, req.query);
    res.json(await c.health.edgeHealth(req.params.accountId, parse(idParam, req.params.edgeId), range));
  }));

  r.get('/health/overview', requirePermission('health:read'), asyncHandler(async (req, res) => {
    res.json(await c.health.overview(req.params.accountId, parse(timeRangeQuery, req.query)));
  }));

  r.get('/events', requirePermission('alert:read'), asyncHandler(async (req, res) => {
    const q = parse(eventsQuery, req.query);
    const range = parse(timeRangeQuery, { from: q.from, to: q.to });
    res.json(await c.alerts.events(req.params.accountId, range, { edgeId: q.edgeId, limit: q.limit }));
  }));

  return r;
}
```

## apps/sdwan-portal/api/src/routes/operationsRoutes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/routes/operationsRoutes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { toCsv } from '../services/ReportService';
import { alertQuerySchema, createBackupSchema, maintenanceWindowSchema, paginationQuery, reportQuerySchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const backupListQuery = paginationQuery.extend({ edgeId: idParam.optional() });
const diffQuery = z.object({ against: idParam.optional() });
const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(60).default(14) });

/** Backups, maintenance windows, alerts and reports: the day-two operations surface. */
export function operationsRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/backups', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    const q = parse(backupListQuery, req.query);
    res.json(await c.backups.list(req.params.accountId, q, q.edgeId));
  }));

  r.post('/backups', requirePermission('backup:create'), asyncHandler(async (req, res) => {
    const { edgeId } = parse(createBackupSchema, req.body);
    const backup = await c.backups.create(req.params.accountId, edgeId, principalOf(res.locals).userId);
    res.status(201).location(`${req.baseUrl}/backups/${backup.id}`).json(backup);
  }));

  r.get('/backups/:id', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    res.json(await c.backups.get(req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.get('/backups/:id/diff', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    const { against } = parse(diffQuery, req.query);
    res.json(await c.backups.diff(req.params.accountId, parse(idParam, req.params.id), against));
  }));

  r.get('/maintenance-windows', requirePermission('maintenance:read'), asyncHandler(async (req, res) => {
    res.json(await c.windows.list(req.params.accountId));
  }));

  r.get('/maintenance-windows/upcoming', requirePermission('maintenance:read'), asyncHandler(async (req, res) => {
    res.json(await c.windows.upcoming(req.params.accountId, parse(upcomingQuery, req.query).days));
  }));

  r.post('/maintenance-windows', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    const w = await c.windows.create(req.params.accountId, parse(maintenanceWindowSchema, req.body));
    res.status(201).location(`${req.baseUrl}/maintenance-windows/${w.id}`).json(w);
  }));

  r.put('/maintenance-windows/:id', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    res.json(await c.windows.update(req.params.accountId, parse(idParam, req.params.id), parse(maintenanceWindowSchema, req.body)));
  }));

  r.delete('/maintenance-windows/:id', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    await c.windows.remove(req.params.accountId, parse(idParam, req.params.id));
    res.status(204).end();
  }));

  r.get('/alerts', requirePermission('alert:read'), asyncHandler(async (req, res) => {
    res.json(await c.alerts.list(req.params.accountId, parse(alertQuerySchema, req.query)));
  }));

  r.post('/alerts/:id/acknowledge', requirePermission('alert:manage'), asyncHandler(async (req, res) => {
    res.json(await c.alerts.acknowledge(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.get('/reports/sla', requirePermission('report:read'), asyncHandler(async (req, res) => {
    const q = parse(reportQuerySchema, req.query);
    const report = await c.reports.slaReport(req.params.accountId, q.period);
    if (q.format === 'csv') {
      res
        .type('text/csv')
        .attachment(`sla-${req.params.accountId}-${q.period}.csv`)
        .send(toCsv(report.links));
      return;
    }
    res.json(report);
  }));

  return r;
}
```

## apps/sdwan-portal/api/src/routes/params.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/routes/params.ts`.

```typescript
import { z } from 'zod';

/** Path identifiers are opaque but bounded and restricted to the characters our id formats use. */
export const idParam = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/, 'invalid identifier');
```

## apps/sdwan-portal/api/src/server.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/server.ts`.

```typescript
import { createApp } from './app';
import { loadConfig } from './config/env';
import { createContainer, parseTenantDirectory } from './container';
import { Scheduler } from './jobs/Scheduler';
import { evaluateAlerts, executeDueChanges, pollMetrics } from './jobs/tasks';
import { createLogger } from './logging/logger';

function main(): void {
  const cfg = loadConfig();
  const logger = createLogger(cfg.LOG_LEVEL);
  const configuredTenants = parseTenantDirectory(process.env.SDWAN_TENANTS);
  const c = createContainer(cfg, logger, { tenants: configuredTenants.length ? configuredTenants : undefined });
  if (cfg.SDWAN_PROVIDER_MODE === 'live' && c.repos.tenants.accounts().length === 0) {
    logger.warn('no SDWAN_TENANTS configured; every account will see an empty inventory');
  }

  const scheduler = new Scheduler(logger.child({ component: 'scheduler' }));
  const deps = { tenants: c.repos.tenants, inventory: c.inventory, metrics: c.repos.metrics, alerts: c.alerts, changes: c.changes, logger };
  scheduler.register('metrics-poll', cfg.METRICS_POLL_INTERVAL_SEC * 1000, () => pollMetrics(deps));
  scheduler.register('alert-eval', cfg.ALERT_EVAL_INTERVAL_SEC * 1000, () => evaluateAlerts(deps));
  scheduler.register('change-executor', cfg.CHANGE_EXECUTOR_INTERVAL_SEC * 1000, () => executeDueChanges(deps));

  const app = createApp(c, {
    corsOrigins: cfg.CORS_ORIGINS.split(',').map((o) => o.trim()),
    jobStatus: () => scheduler.status(),
  });
  const server = app.listen(cfg.PORT, () => {
    logger.info('sdwan-portal-api listening', { port: cfg.PORT, providerMode: cfg.SDWAN_PROVIDER_MODE });
    scheduler.start();
    void scheduler.runNow('metrics-poll').then(() => scheduler.runNow('alert-eval'));
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    scheduler.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
```

## apps/sdwan-portal/api/src/services/AlertService.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/AlertService.test.ts`.

```typescript
import type { Edge, LinkSample } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE } from '../testing/harness';
import { evaluateEdgeConditions, fingerprintOf } from './AlertService';

function edge(overrides: Partial<Edge> = {}): Edge {
  return {
    id: 'e1',
    siteId: 's1',
    accountId: ACCOUNT,
    vendor: 'VELOCLOUD',
    vendorRef: { vendor: 'VELOCLOUD', tenant: '1001', id: 'e1' },
    name: 'leeds-1',
    model: 'edge840',
    serialNumber: 'SN1',
    softwareVersion: '5.2.1',
    status: 'UP',
    haState: 'STANDALONE',
    links: [
      { id: 'e1:GE1', edgeId: 'e1', name: 'GE1', interface: 'GE1', transport: 'FIBRE', bandwidthDownKbps: 1e6, bandwidthUpKbps: 1e6, state: 'UP' },
      { id: 'e1:LTE', edgeId: 'e1', name: 'LTE', interface: 'CELL1', transport: 'LTE', bandwidthDownKbps: 5e4, bandwidthUpKbps: 1e4, state: 'UP' },
    ],
    ...overrides,
  };
}

function samples(linkId: string, n: number, latencyMs: number, lossPct = 0): LinkSample[] {
  return Array.from({ length: n }, (_, i) => ({
    edgeId: 'e1',
    linkId,
    timestamp: new Date(Date.UTC(2026, 2, 2, 10, i * 5)).toISOString(),
    latencyMs,
    jitterMs: 2,
    lossPct,
    rxBps: 1000,
    txBps: 1000,
  }));
}

describe('evaluateEdgeConditions', () => {
  it('reports only EDGE_DOWN for an offline edge', () => {
    expect(evaluateEdgeConditions(edge({ status: 'DOWN' }), [])).toEqual([
      expect.objectContaining({ type: 'EDGE_DOWN', severity: 'CRITICAL' }),
    ]);
  });

  it('escalates LINK_DOWN to CRITICAL when the last active link fails', () => {
    const e = edge();
    e.links[1].state = 'DOWN';
    expect(evaluateEdgeConditions(e, [])).toEqual([expect.objectContaining({ type: 'LINK_DOWN', linkId: 'e1:LTE', severity: 'MAJOR' })]);
    e.links[0].state = 'DOWN';
    expect(evaluateEdgeConditions(e, []).map((c) => c.severity)).toEqual(['CRITICAL', 'CRITICAL']);
  });

  it('grades quality breaches on p95 and ignores links with too few samples', () => {
    const conds = evaluateEdgeConditions(edge(), [...samples('e1:GE1', 6, 400, 3), ...samples('e1:LTE', 2, 900)]);
    expect(conds.map((c) => [c.type, c.linkId, c.severity])).toEqual([
      ['HIGH_LATENCY', 'e1:GE1', 'MAJOR'],
      ['HIGH_LOSS', 'e1:GE1', 'MAJOR'],
    ]);
  });
});

describe('AlertService', () => {
  const down = { type: 'LINK_DOWN' as const, edgeId: HA_EDGE, linkId: `${HA_EDGE}:GE4`, severity: 'MAJOR' as const, message: 'GE4 down' };

  it('de-duplicates repeated conditions and escalates severity', async () => {
    const h = createHarness();
    await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [down]);
    h.clock.advance(1);
    const second = await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [{ ...down, severity: 'CRITICAL' }]);
    expect(second.raised).toBe(0);

    const page = await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ occurrences: 2, severity: 'CRITICAL', fingerprint: fingerprintOf(down) });
  });

  it('auto-resolves evaluated alerts once the condition clears and keeps acknowledgements single-shot', async () => {
    const h = createHarness();
    await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [down]);
    const [alert] = (await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10 })).items;

    const acked = await h.c.alerts.acknowledge(h.principal('u1', 'BUSINESS_USER'), ACCOUNT, alert.id);
    expect(acked).toMatchObject({ status: 'ACKNOWLEDGED', acknowledgedBy: 'u1' });
    await expect(h.c.alerts.acknowledge(h.principal('u2', 'BUSINESS_USER'), ACCOUNT, alert.id)).rejects.toMatchObject({ status: 409 });

    expect(await h.c.alerts.reconcileEdge(ACCOUNT, HA_EDGE, [])).toEqual({ raised: 0, resolved: 1 });
    const resolved = await h.c.alerts.list(ACCOUNT, { page: 1, pageSize: 10, status: 'RESOLVED' });
    expect(resolved.items[0].resolvedAt).toBe(h.clock.now().toISOString());
  });

  it('merges vendor events newest first and reports unreachable controllers', async () => {
    const h = createHarness();
    jest.spyOn(h.mocks.FORTINET, 'listEvents').mockRejectedValue(new Error('FMG down'));
    const res = await h.c.alerts.events(ACCOUNT, { from: '2026-03-01T00:00:00Z', to: '2026-03-02T00:00:00Z' }, { limit: 500 });
    expect(res.unavailable).toEqual(['FORTINET']);
    expect(res.items.every((e) => e.vendor === 'VELOCLOUD')).toBe(true);
    const times = res.items.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});
```

## apps/sdwan-portal/api/src/services/AlertService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/AlertService.ts`.

```typescript
import { randomUUID } from 'node:crypto';
import { DEFAULT_SLA } from '../domain/linkScoring';
import { aggregateLink } from '../domain/metricsAggregation';
import type { Alert, AlertSeverity, AlertStatus, AlertType, Edge, LinkSample, Page, Principal, SdwanEvent, SlaThresholds, Vendor } from '../domain/types';
import { ConflictProblem, NotFoundProblem } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { AlertRepository, TenantDirectory } from '../repositories';
import type { PageRequest } from '../repositories/InMemoryRepository';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { InventoryService } from './InventoryService';

export interface AlertCondition {
  type: AlertType;
  edgeId: string;
  linkId?: string;
  severity: AlertSeverity;
  message: string;
}

export interface AlertFilter extends PageRequest {
  status?: AlertStatus;
  severity?: AlertSeverity;
  edgeId?: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1 };

/** Alert types this service derives from inventory and metrics; vendor-pushed types are never auto-resolved here. */
const EVALUATED_TYPES: ReadonlySet<AlertType> = new Set(['EDGE_DOWN', 'LINK_DOWN', 'HIGH_LATENCY', 'HIGH_JITTER', 'HIGH_LOSS']);

/** Minimum samples in the evaluation window before quality alerts fire, so one late probe cannot page anyone. */
const MIN_SAMPLES = 3;

export function fingerprintOf(c: Pick<AlertCondition, 'type' | 'edgeId' | 'linkId'>): string {
  return `${c.type}:${c.edgeId}:${c.linkId ?? '-'}`;
}

/** Breach severity grows with how far p95 sits above the threshold: 2x the limit is MAJOR. */
function breachSeverity(value: number, limit: number): AlertSeverity {
  return value >= limit * 2 ? 'MAJOR' : 'MINOR';
}

/**
 * Pure rule evaluation for one edge. Quality rules look at p95 rather than the mean so
 * short but repeated spikes (the ones users notice on calls) are caught, and are skipped
 * for links that are down — the LINK_DOWN alert already covers them.
 */
export function evaluateEdgeConditions(edge: Edge, samples: LinkSample[], sla: SlaThresholds = DEFAULT_SLA.REALTIME): AlertCondition[] {
  if (edge.status === 'DOWN') {
    return [{ type: 'EDGE_DOWN', edgeId: edge.id, severity: 'CRITICAL', message: `Edge ${edge.name} is offline` }];
  }
  const out: AlertCondition[] = [];
  const activeLinks = edge.links.filter((l) => l.state !== 'STANDBY');
  for (const link of activeLinks) {
    if (link.state === 'DOWN') {
      const lastActive = activeLinks.every((l) => l.id === link.id || l.state === 'DOWN');
      out.push({
        type: 'LINK_DOWN',
        edgeId: edge.id,
        linkId: link.id,
        severity: lastActive ? 'CRITICAL' : 'MAJOR',
        message: `${edge.name} link ${link.name} (${link.transport}) is down`,
      });
      continue;
    }
    const agg = aggregateLink(samples.filter((s) => s.linkId === link.id));
    if (!agg || agg.samples < MIN_SAMPLES) continue;
    const checks: Array<[AlertType, number, number, string]> = [
      ['HIGH_LATENCY', agg.latencyMs.p95, sla.maxLatencyMs, 'ms latency'],
      ['HIGH_JITTER', agg.jitterMs.p95, sla.maxJitterMs, 'ms jitter'],
      ['HIGH_LOSS', agg.lossPct.p95, sla.maxLossPct, '% loss'],
    ];
    for (const [type, value, limit, unit] of checks) {
      if (value > limit) {
        out.push({
          type,
          edgeId: edge.id,
          linkId: link.id,
          severity: breachSeverity(value, limit),
          message: `${edge.name} link ${link.name}: p95 ${value}${unit} exceeds ${limit}${unit}`,
        });
      }
    }
  }
  return out;
}

/**
 * Raises, de-duplicates and auto-resolves alerts. A condition seen again bumps the
 * existing alert's occurrence count (and escalates severity) instead of creating a new
 * one; an evaluated alert whose condition has cleared is resolved on the next pass.
 */
export class AlertService {
  constructor(
    private readonly repo: AlertRepository,
    private readonly inventory: InventoryService,
    private readonly metrics: MetricsStore,
    private readonly providers: ProviderRegistry,
    private readonly tenants: TenantDirectory,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
    private readonly evaluationWindowMs = 15 * 60_000,
  ) {}

  async evaluateAccount(accountId: string): Promise<{ raised: number; resolved: number }> {
    const edges = await this.inventory.listEdges(accountId);
    const nowMs = this.now().getTime();
    const from = new Date(nowMs - this.evaluationWindowMs).toISOString();
    const to = new Date(nowMs).toISOString();
    let raised = 0;
    let resolved = 0;
    for (const edge of edges) {
      const conditions = evaluateEdgeConditions(edge, this.metrics.queryEdge(edge.id, from, to));
      const r = await this.reconcileEdge(accountId, edge.id, conditions);
      raised += r.raised;
      resolved += r.resolved;
    }
    if (raised || resolved) this.logger.info('alerts evaluated', { accountId, raised, resolved });
    return { raised, resolved };
  }

  async reconcileEdge(accountId: string, edgeId: string, conditions: AlertCondition[]): Promise<{ raised: number; resolved: number }> {
    const at = this.now().toISOString();
    const active = new Set<string>();
    let raised = 0;
    for (const c of conditions) {
      const fingerprint = fingerprintOf(c);
      active.add(fingerprint);
      const existing = await this.repo.findOpenByFingerprint(fingerprint);
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeenAt = at;
        existing.message = c.message;
        if (SEVERITY_RANK[c.severity] > SEVERITY_RANK[existing.severity]) existing.severity = c.severity;
        await this.repo.update(existing);
        continue;
      }
      await this.repo.insert({
        id: `ALR-${randomUUID()}`,
        accountId,
        edgeId: c.edgeId,
        linkId: c.linkId,
        type: c.type,
        severity: c.severity,
        status: 'OPEN',
        message: c.message,
        fingerprint,
        occurrences: 1,
        raisedAt: at,
        lastSeenAt: at,
      });
      raised++;
    }

    const stale = await this.repo.find(
      (a) => a.accountId === accountId && a.edgeId === edgeId && a.status !== 'RESOLVED' && EVALUATED_TYPES.has(a.type) && !active.has(a.fingerprint),
    );
    for (const a of stale) await this.repo.update({ ...a, status: 'RESOLVED', resolvedAt: at });
    return { raised, resolved: stale.length };
  }

  async list(accountId: string, filter: AlertFilter): Promise<Page<Alert>> {
    return this.repo.page(
      (a) =>
        a.accountId === accountId &&
        (!filter.status || a.status === filter.status) &&
        (!filter.severity || a.severity === filter.severity) &&
        (!filter.edgeId || a.edgeId === filter.edgeId),
      filter,
      (a, b) =>
        Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
  }

  async acknowledge(principal: Principal, accountId: string, id: string): Promise<Alert> {
    const alert = await this.repo.get(id);
    if (!alert || alert.accountId !== accountId) throw new NotFoundProblem('Alert', id);
    if (alert.status !== 'OPEN') throw new ConflictProblem(`Alert is already ${alert.status}`, { status: alert.status });
    return this.repo.update({ ...alert, status: 'ACKNOWLEDGED', acknowledgedBy: principal.userId, acknowledgedAt: this.now().toISOString() });
  }

  /** Vendor events for the account, newest first. A controller outage drops its events rather than failing the call. */
  async events(accountId: string, range: { from: string; to: string }, filter: { edgeId?: string; limit: number }): Promise<{ items: SdwanEvent[]; unavailable: Vendor[] }> {
    const mappings = this.tenants.tenantsFor(accountId);
    const results = await Promise.allSettled(
      mappings.map((m) => this.providers.get(m.vendor).listEvents({ accountId, tenant: m.tenant }, range)),
    );
    const items: SdwanEvent[] = [];
    const unavailable = new Set<Vendor>();
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') items.push(...r.value);
      else {
        unavailable.add(mappings[i].vendor);
        this.logger.warn('event fetch failed', { accountId, vendor: mappings[i].vendor, err: r.reason });
      }
    });
    return {
      items: items
        .filter((e) => !filter.edgeId || e.edgeId === filter.edgeId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, filter.limit),
      unavailable: [...unavailable],
    };
  }
}
```

## apps/sdwan-portal/api/src/services/BackupService.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/BackupService.test.ts`.

```typescript
import { ACCOUNT, createHarness, HA_EDGE, SOLO_EDGE } from '../testing/harness';
import { isRestoreCompatible } from './BackupService';

describe('isRestoreCompatible', () => {
  it.each([
    ['7.2.8', '7.2.8', true],
    ['7.0.12', '7.2.8', true],
    ['7.4.1', '7.2.8', false],
    ['6.4.9', '7.2.8', false],
    ['garbage', '7.2.8', false],
  ])('%s onto %s -> %s', (snap, running, ok) => {
    expect(isRestoreCompatible(snap, running)).toBe(ok);
  });
});

describe('BackupService', () => {
  it('takes checksummed snapshots and diffs them against live config', async () => {
    const h = createHarness();
    const backup = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u-admin');
    expect(backup).toMatchObject({ reason: 'MANUAL', vendor: 'VELOCLOUD', checksum: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(backup).not.toHaveProperty('content');

    expect((await h.c.backups.diff(ACCOUNT, backup.id)).identical).toBe(true);

    await h.mocks.VELOCLOUD.applyFirewallRules({ accountId: ACCOUNT, tenant: '1001' }, 'hq-edge-1', [
      { id: 'r1', name: 'web', sequence: 10, enabled: true, action: 'ALLOW', protocol: 'TCP', sourceCidrs: [], destinationCidrs: [], destinationPorts: [{ from: 443, to: 443 }], log: false },
    ]);
    const diff = await h.c.backups.diff(ACCOUNT, backup.id);
    expect(diff.identical).toBe(false);
    expect(diff.summary.ADDED).toBe(1);
    expect(diff.entries[0]).toMatchObject({ op: 'ADDED', path: 'firewall[id=r1]' });
  });

  it('refuses to compare or restore across edges and detects tampering', async () => {
    const h = createHarness();
    const a = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u');
    const b = await h.c.backups.create(ACCOUNT, SOLO_EDGE, 'u');
    await expect(h.c.backups.diff(ACCOUNT, a.id, b.id)).rejects.toMatchObject({ status: 422 });
    await expect(h.c.backups.restore(ACCOUNT, a.id, SOLO_EDGE)).rejects.toMatchObject({ status: 422 });

    const stored = await h.c.repos.backups.get(a.id);
    await h.c.repos.backups.update({ ...stored!, content: { ...stored!.content, injected: true } });
    await expect(h.c.backups.restore(ACCOUNT, a.id, HA_EDGE)).rejects.toMatchObject({ extensions: expect.objectContaining({ rule: 'backup-corrupt' }) });
  });

  it('hides other accounts’ backups', async () => {
    const h = createHarness();
    const a = await h.c.backups.create(ACCOUNT, HA_EDGE, 'u');
    await expect(h.c.backups.get('ACC-99999999', a.id)).rejects.toMatchObject({ status: 404 });
  });
});
```

## apps/sdwan-portal/api/src/services/BackupService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/BackupService.ts`.

```typescript
import { randomUUID } from 'node:crypto';
import { checksum, DiffEntry, diffConfig, summarizeDiff } from '../domain/configDiff';
import type { ConfigBackup, Page } from '../domain/types';
import { BusinessRuleProblem, NotFoundProblem } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ApplyResult } from '../providers/SdwanProvider';
import type { BackupRepository } from '../repositories';
import type { PageRequest } from '../repositories/InMemoryRepository';
import type { InventoryService } from './InventoryService';

export type BackupSummary = Omit<ConfigBackup, 'content'>;

export interface BackupDiff {
  from: { id: string | 'LIVE'; takenAt: string; checksum: string };
  to: { id: string | 'LIVE'; takenAt: string; checksum: string };
  identical: boolean;
  summary: ReturnType<typeof summarizeDiff>;
  entries: DiffEntry[];
}

function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

/**
 * A snapshot can be restored onto an edge when it was taken on the same major release and
 * an equal-or-older minor release: controllers accept older config schemas within a major,
 * but a snapshot from a newer minor may carry objects the running firmware cannot parse.
 */
export function isRestoreCompatible(snapshotVersion: string, runningVersion: string): boolean {
  const snap = parseVersion(snapshotVersion);
  const run = parseVersion(runningVersion);
  if (!snap || !run) return false;
  return snap[0] === run[0] && snap[1] <= run[1];
}

function withoutContent(b: ConfigBackup): BackupSummary {
  const summary: Partial<ConfigBackup> = { ...b };
  delete summary.content;
  return summary as BackupSummary;
}

/** Checksummed configuration snapshots per edge, used for manual backups, pre-change safety nets and rollbacks. */
export class BackupService {
  constructor(
    private readonly repo: BackupRepository,
    private readonly inventory: InventoryService,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    accountId: string,
    edgeId: string,
    takenBy: string,
    reason: ConfigBackup['reason'] = 'MANUAL',
    changeRequestId?: string,
  ): Promise<BackupSummary> {
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    const snapshot = await provider.exportConfig(ctx, edge.vendorRef.id);
    const serialized = JSON.stringify(snapshot.content);
    const backup: ConfigBackup = {
      id: `BKP-${randomUUID()}`,
      accountId,
      edgeId,
      vendor: edge.vendor,
      takenAt: this.now().toISOString(),
      takenBy,
      reason,
      changeRequestId,
      checksum: checksum(snapshot.content),
      sizeBytes: Buffer.byteLength(serialized, 'utf8'),
      vendorVersion: snapshot.vendorVersion,
      content: snapshot.content,
    };
    await this.repo.insert(backup);
    this.logger.info('config backup taken', { edgeId, backupId: backup.id, reason, sizeBytes: backup.sizeBytes });
    return withoutContent(backup);
  }

  async list(accountId: string, req: PageRequest, edgeId?: string): Promise<Page<BackupSummary>> {
    const page = await this.repo.page(
      (b) => b.accountId === accountId && (!edgeId || b.edgeId === edgeId),
      req,
      (a, b) => b.takenAt.localeCompare(a.takenAt),
    );
    return { ...page, items: page.items.map(withoutContent) };
  }

  async get(accountId: string, backupId: string): Promise<ConfigBackup> {
    const backup = await this.repo.get(backupId);
    if (!backup || backup.accountId !== accountId) throw new NotFoundProblem('Backup', backupId);
    return backup;
  }

  /** Diffs a backup against another backup of the same edge, or against the edge's live config when `againstId` is omitted. */
  async diff(accountId: string, backupId: string, againstId?: string): Promise<BackupDiff> {
    const base = await this.get(accountId, backupId);
    let target: { id: string; takenAt: string; content: Record<string, unknown> };
    if (againstId) {
      const other = await this.get(accountId, againstId);
      if (other.edgeId !== base.edgeId) {
        throw new BusinessRuleProblem('backup-edge-mismatch', 'Backups can only be compared for the same edge', {
          edgeIds: [base.edgeId, other.edgeId],
        });
      }
      target = other;
    } else {
      const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, base.edgeId);
      const live = await provider.exportConfig(ctx, edge.vendorRef.id);
      target = { id: 'LIVE', takenAt: this.now().toISOString(), content: live.content };
    }
    const entries = diffConfig(base.content, target.content);
    const targetChecksum = checksum(target.content);
    return {
      from: { id: base.id, takenAt: base.takenAt, checksum: base.checksum },
      to: { id: target.id, takenAt: target.takenAt, checksum: targetChecksum },
      identical: targetChecksum === base.checksum,
      summary: summarizeDiff(entries),
      entries,
    };
  }

  /** Validates integrity and firmware compatibility, then pushes the snapshot back to the edge. */
  async restore(accountId: string, backupId: string, edgeId: string): Promise<ApplyResult> {
    const backup = await this.get(accountId, backupId);
    if (backup.edgeId !== edgeId) {
      throw new BusinessRuleProblem('backup-edge-mismatch', `Backup ${backupId} belongs to edge ${backup.edgeId}, not ${edgeId}`);
    }
    if (checksum(backup.content) !== backup.checksum) {
      throw new BusinessRuleProblem('backup-corrupt', `Backup ${backupId} failed checksum verification`);
    }
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    if (!isRestoreCompatible(backup.vendorVersion, edge.softwareVersion)) {
      throw new BusinessRuleProblem(
        'backup-incompatible',
        `Backup taken on ${backup.vendorVersion} cannot be restored onto ${edge.softwareVersion}`,
        { backupVersion: backup.vendorVersion, runningVersion: edge.softwareVersion },
      );
    }
    return provider.restoreConfig(ctx, edge.vendorRef.id, { content: backup.content, vendorVersion: backup.vendorVersion });
  }
}
```

## apps/sdwan-portal/api/src/services/ChangeRequestService.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/ChangeRequestService.test.ts`.

```typescript
import type { FirewallRule } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE, Harness, SOLO_EDGE } from '../testing/harness';
import { createChangeRequestSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { compareVersions } from './ChangeRequestService';

const voicePolicy = {
  id: 'p-voice',
  name: 'Voice',
  order: 10,
  enabled: true,
  match: { applications: ['ms-teams'] },
  action: { serviceClass: 'REALTIME', priority: 'HIGH', steering: 'BEST_PATH' },
};

function rule(id: string, sequence: number, overrides: Partial<FirewallRule> = {}): FirewallRule {
  return {
    id,
    name: id,
    sequence,
    enabled: true,
    action: 'ALLOW',
    protocol: 'TCP',
    sourceCidrs: ['10.0.0.0/24'],
    destinationCidrs: ['0.0.0.0/0'],
    destinationPorts: [{ from: 443, to: 443 }],
    log: false,
    ...overrides,
  };
}

const denyAll = rule('deny-all', 9999, { action: 'DENY', protocol: 'ANY', sourceCidrs: ['0.0.0.0/0'], destinationPorts: [] });

describe('ChangeRequestService', () => {
  let h: Harness;
  const user = () => h.principal('u-requester', 'BUSINESS_USER');
  const admin = () => h.principal('u-admin', 'BUSINESS_ADMIN');
  const noc = () => h.principal('u-noc', 'SUPPORT_AGENT');
  const input = (body: Record<string, unknown>) => parse(createChangeRequestSchema, { title: 'Test change', ...body });

  beforeEach(() => {
    h = createHarness();
  });

  it('runs a low-risk policy change from submission to completion with a pre-change backup', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'POLICY_UPDATE', policies: [voicePolicy] }, submit: true }));
    expect(cr).toMatchObject({ status: 'SUBMITTED', risk: 'LOW', outstanding: ['1 more approval(s)'] });

    await expect(h.c.changes.decide(user(), ACCOUNT, cr.id, { decision: 'APPROVE' })).rejects.toMatchObject({ status: 422, slug: 'rule/approval' });
    const approved = await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' });
    expect(approved.status).toBe('APPROVED');

    const at = new Date(h.clock.ms + 60 * 60_000).toISOString();
    expect((await h.c.changes.schedule(user(), ACCOUNT, cr.id, { scheduledFor: at })).status).toBe('SCHEDULED');

    expect(await h.c.changes.executeDue()).toHaveLength(0);
    h.clock.advance(61);
    const [done] = await h.c.changes.executeDue();

    expect(done.status).toBe('COMPLETED');
    expect(done.results).toEqual([expect.objectContaining({ edgeId: HA_EDGE, ok: true, backupId: expect.stringMatching(/^BKP-/) })]);
    expect(done.history.map((x) => x.to)).toEqual(['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED']);
    expect(h.mocks.VELOCLOUD.calls).toContainEqual({ method: 'applyBusinessPolicies', edge: 'hq-edge-1' });
    const backups = await h.c.backups.list(ACCOUNT, { page: 1, pageSize: 10 }, HA_EDGE);
    expect(backups.items).toEqual([expect.objectContaining({ reason: 'PRE_CHANGE', changeRequestId: cr.id })]);
  });

  it('rejects a firewall rule set with blocking lint errors', async () => {
    const rules = [rule('a', 10), rule('b', 10, { destinationPorts: [{ from: 22, to: 22 }] })];
    await expect(
      h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [SOLO_EDGE], payload: { type: 'FIREWALL_UPDATE', rules } })),
    ).rejects.toMatchObject({ status: 422, extensions: expect.objectContaining({ rule: 'firewall-lint' }) });
  });

  it('requires a maintenance window for medium-risk changes and validates the slot', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [SOLO_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true }));
    expect(cr.risk).toBe('MEDIUM');
    expect(cr.riskReasons).toContain('1 edge(s) have no HA peer (+2)');
    await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' });

    await expect(
      h.c.changes.schedule(user(), ACCOUNT, cr.id, { scheduledFor: '2026-03-02T22:30:00Z' }),
    ).rejects.toMatchObject({ status: 422, extensions: expect.objectContaining({ rule: 'maintenance-window' }) });

    const w = await h.c.windows.create(ACCOUNT, { name: 'Nightly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '22:00', durationMinutes: 240, blackoutDates: [] });
    await expect(
      h.c.changes.schedule(user(), ACCOUNT, cr.id, { maintenanceWindowId: w.id, scheduledFor: '2026-03-02T12:00:00Z' }),
    ).rejects.toMatchObject({ status: 422 });
    const scheduled = await h.c.changes.schedule(user(), ACCOUNT, cr.id, { maintenanceWindowId: w.id, scheduledFor: '2026-03-02T22:30:00Z' });
    expect(scheduled).toMatchObject({ status: 'SCHEDULED', maintenanceWindowId: w.id });

    await expect(h.c.windows.remove(ACCOUNT, w.id)).rejects.toMatchObject({ status: 409 });
  });

  it('stops at the first failing edge, restores its snapshot and skips the rest', async () => {
    jest.spyOn(h.mocks.FORTINET, 'applyFirewallRules').mockRejectedValueOnce(new Error('device rejected policy'));
    const cr = await h.c.changes.create(
      user(),
      ACCOUNT,
      input({ edgeIds: [SOLO_EDGE, HA_EDGE], payload: { type: 'FIREWALL_UPDATE', rules: [rule('web', 10), denyAll] }, emergency: true, submit: true }),
    );
    // 2 edges, one without HA, plus the deny-all overlapping the allow rule: HIGH, two approvals.
    expect(cr.risk).toBe('HIGH');
    expect((await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'APPROVE' })).status).toBe('SUBMITTED');
    await expect(
      h.c.changes.decide(h.principal('u-admin-2', 'BUSINESS_ADMIN'), ACCOUNT, cr.id, { decision: 'APPROVE' }),
    ).rejects.toMatchObject({ message: 'emergency changes require a SUPPORT_AGENT approval' });
    expect((await h.c.changes.decide(noc(), ACCOUNT, cr.id, { decision: 'APPROVE' })).status).toBe('APPROVED');

    const [done] = await h.c.changes.executeDue();
    expect(done.status).toBe('FAILED');
    expect(done.results).toHaveLength(1);
    expect(done.results[0].error).toMatch(/device rejected policy; pre-change config restored/);
    expect(h.mocks.FORTINET.calls).toContainEqual({ method: 'restoreConfig', edge: 'sheff-edge-1' });
    expect(h.mocks.VELOCLOUD.calls).toHaveLength(0);
  });

  it('refuses software downgrades and illegal transitions', async () => {
    await expect(
      h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'SOFTWARE_UPGRADE', targetVersion: '5.2.0' } })),
    ).rejects.toMatchObject({ status: 422 });

    const draft = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' } }));
    await expect(h.c.changes.schedule(user(), ACCOUNT, draft.id, { scheduledFor: '2026-03-03T00:00:00Z' })).rejects.toMatchObject({ status: 409 });
    await expect(h.c.changes.cancel(h.principal('u-other', 'BUSINESS_USER'), ACCOUNT, draft.id)).rejects.toMatchObject({ status: 403 });
    expect((await h.c.changes.cancel(user(), ACCOUNT, draft.id, 'no longer needed')).status).toBe('CANCELLED');
    await expect(h.c.changes.get('ACC-99999999', draft.id)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects the whole change on a single rejection', async () => {
    const cr = await h.c.changes.create(user(), ACCOUNT, input({ edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true }));
    const rejected = await h.c.changes.decide(admin(), ACCOUNT, cr.id, { decision: 'REJECT', comment: 'not during trading hours' });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.history.at(-1)).toMatchObject({ to: 'REJECTED', note: 'not during trading hours' });
  });
});

describe('compareVersions', () => {
  it.each([
    ['5.2.1', '5.2.0', 1],
    ['5.2.0', '5.10.0', -1],
    ['7.2', '7.2.0', 0],
  ])('%s vs %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});
```
