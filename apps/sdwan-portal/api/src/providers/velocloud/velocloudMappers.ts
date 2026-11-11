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
