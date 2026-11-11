import type {
  AlertSeverity,
  Edge,
  EdgeStatus,
  HaState,
  LinkSample,
  LinkState,
  SdwanEvent,
  Transport,
  WanLink,
} from '../../domain/types';
import { deriveEdgeStatus } from '../../domain/linkScoring';
import type {
  FgtEventLog,
  FgtHealthCheckMonitor,
  FgtHealthCheckStats,
  FgtInterface,
  FgtSdwanMember,
  FmgDevice,
} from './fortinetTypes';

// Address/service/firewall and SD-WAN rule mappers live in their own files;
// re-exported here so existing imports keep working.
export * from './fortinetObjects';
export * from './fortinetSdwanRules';

export function edgeIdFor(adom: string, deviceName: string): string {
  return `ft-${adom}-${deviceName}`;
}

export function firmwareString(d: Pick<FmgDevice, 'os_ver' | 'mr' | 'patch' | 'build'>): string {
  return `${d.os_ver}.${d.mr}.${d.patch}${d.build ? ` build${d.build}` : ''}`;
}

export function mapDeviceStatus(conn: FmgDevice['conn_status']): EdgeStatus {
  if (conn === 1) return 'UP';
  if (conn === 2) return 'DOWN';
  return 'UNKNOWN';
}

export function mapHa(d: Pick<FmgDevice, 'ha_mode' | 'ha_slave' | 'sn'>): HaState {
  if (d.ha_mode === 0 || !d.ha_slave?.length) return 'STANDALONE';
  const self = d.ha_slave.find((m) => m.sn === d.sn);
  if (self && self.status === 0) return 'FAILED';
  if (self && (self.role === 'slave' || self.role === 'secondary')) return 'STANDBY';
  if (d.ha_slave.some((m) => m.status === 0)) return 'FAILED';
  return 'ACTIVE';
}

/** Interface description is set at provisioning to "<transport>|<isp>", e.g. "fibre|Uniti". */
export function parseInterfaceDescription(desc: string | undefined): { transport: Transport; isp?: string } {
  if (!desc) return { transport: 'UNKNOWN' };
  const [kind, isp] = desc.split('|').map((s) => s.trim());
  const transport = transportFromKind(kind.toLowerCase());
  return { transport, isp: isp || undefined };
}

function transportFromKind(k: string): Transport {
  if (k === 'fibre' || k === 'fiber' || k === 'ftth') return 'FIBRE';
  if (k === 'broadband' || k === 'dsl' || k === 'fttc') return 'BROADBAND';
  if (k === 'lte' || k === '4g' || k === '5g') return 'LTE';
  if (k === 'mpls') return 'MPLS';
  return 'UNKNOWN';
}

export function linkStateFromMonitor(
  memberIf: string,
  member: FgtSdwanMember,
  monitor: FgtHealthCheckMonitor | undefined,
): LinkState {
  if (member.status === 'disable') return 'STANDBY';
  if (!monitor) return 'UNKNOWN';
  let seen = false;
  for (const hc of Object.values(monitor)) {
    const stats = hc[memberIf];
    if (!stats || !stats.status) continue;
    if (stats.status === 'up') return 'UP';
    seen = true;
  }
  return seen ? 'DOWN' : 'UNKNOWN';
}

export function mapLinks(
  edgeId: string,
  members: FgtSdwanMember[],
  interfaces: FgtInterface[],
  monitor?: FgtHealthCheckMonitor,
): WanLink[] {
  const ifByName = new Map(interfaces.map((i) => [i.name, i]));
  return members.map((m) => {
    const intf = ifByName.get(m.interface);
    const meta = parseInterfaceDescription(intf?.description);
    return {
      id: `${edgeId}:${m.interface}`,
      edgeId,
      name: intf?.alias || m.interface,
      interface: m.interface,
      transport: meta.transport,
      ispName: meta.isp,
      publicIp: intf?.ip?.[0] && intf.ip[0] !== '0.0.0.0' ? intf.ip[0] : undefined,
      bandwidthDownKbps: intf?.['estimated-downstream-bandwidth'] ?? 0,
      bandwidthUpKbps: intf?.['estimated-upstream-bandwidth'] ?? 0,
      state: linkStateFromMonitor(m.interface, m, monitor),
    };
  });
}

export function mapDevice(
  adom: string,
  accountId: string,
  siteId: string,
  d: FmgDevice,
  links: WanLink[],
): Edge {
  const id = edgeIdFor(adom, d.name);
  return {
    id,
    siteId,
    accountId,
    vendor: 'FORTINET',
    vendorRef: { vendor: 'FORTINET', tenant: adom, id: d.name },
    name: d.name,
    model: d.platform_str,
    serialNumber: d.sn,
    softwareVersion: firmwareString(d),
    status: deriveEdgeStatus(mapDeviceStatus(d.conn_status), links.map((l) => l.state)),
    haState: mapHa(d),
    lastContact: d.last_checked ? new Date(d.last_checked * 1000).toISOString() : undefined,
    links,
  };
}

/**
 * FortiGate only exposes the current health-check reading (history lives in
 * FortiAnalyzer), so each poll yields one sample per member. The metrics poller stores
 * these to build the time series. When several health checks probe the same member, the
 * worst reading is used, matching how FortiOS evaluates SLA for steering.
 */
export function samplesFromMonitor(edgeId: string, monitor: FgtHealthCheckMonitor, atIso: string): LinkSample[] {
  const byMember = new Map<string, LinkSample>();
  for (const hc of Object.values(monitor)) {
    for (const [memberIf, stats] of Object.entries(hc)) {
      const sample = sampleFromStats(edgeId, memberIf, stats, atIso);
      const prev = byMember.get(memberIf);
      byMember.set(memberIf, prev ? worstOf(prev, sample) : sample);
    }
  }
  return [...byMember.values()];
}

function sampleFromStats(edgeId: string, memberIf: string, stats: FgtHealthCheckStats, atIso: string): LinkSample {
  const down = stats.status !== 'up';
  return {
    edgeId,
    linkId: `${edgeId}:${memberIf}`,
    timestamp: atIso,
    latencyMs: down ? 0 : stats.latency ?? 0,
    jitterMs: down ? 0 : stats.jitter ?? 0,
    lossPct: down ? 100 : stats.packet_loss ?? 0,
    rxBps: (stats.rx_bandwidth ?? 0) * 1000,
    txBps: (stats.tx_bandwidth ?? 0) * 1000,
  };
}

function worstOf(prev: LinkSample, sample: LinkSample): LinkSample {
  return {
    ...prev,
    latencyMs: Math.max(prev.latencyMs, sample.latencyMs),
    jitterMs: Math.max(prev.jitterMs, sample.jitterMs),
    lossPct: Math.max(prev.lossPct, sample.lossPct),
    rxBps: Math.max(prev.rxBps, sample.rxBps),
    txBps: Math.max(prev.txBps, sample.txBps),
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function mapLogLevel(level: FgtEventLog['level']): AlertSeverity {
  switch (level) {
    case 'emergency':
    case 'alert':
    case 'critical':
      return 'CRITICAL';
    case 'error':
      return 'MAJOR';
    case 'warning':
      return 'MINOR';
    default:
      return 'INFO';
  }
}

function eventCategory(log: FgtEventLog): SdwanEvent['category'] {
  if (log.cfgpath) return 'CONFIG';
  if (log.subtype === 'sdwan') return 'LINK';
  if (log.subtype === 'ha') return 'EDGE';
  if (log.subtype === 'vpn' || log.subtype === 'user') return 'SECURITY';
  return 'SYSTEM';
}

export function mapEventLog(adom: string, accountId: string, device: string, log: FgtEventLog): SdwanEvent {
  const category = eventCategory(log);
  // eventtime is nanoseconds since epoch on FortiOS 6.4+.
  const ms = log.eventtime > 1e15 ? Math.floor(log.eventtime / 1e6) : log.eventtime * 1000;
  return {
    id: `ft-${adom}-${device}-${log.logid}-${log.eventtime}`,
    accountId,
    edgeId: edgeIdFor(adom, device),
    vendor: 'FORTINET',
    occurredAt: new Date(ms).toISOString(),
    category,
    severity: mapLogLevel(log.level),
    message: log.msg || log.logdesc,
    raw: { logid: log.logid, subtype: log.subtype, cfgpath: log.cfgpath },
  };
}
