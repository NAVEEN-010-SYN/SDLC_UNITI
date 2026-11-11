import type {
  AlertSeverity,
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
  ServiceClass,
  SlaThresholds,
  Transport,
  WanLink,
} from '../../domain/types';
import { intToIp, netmaskToPrefix, parseCidr, prefixToNetmask, parsePortList } from '../../domain/cidr';
import { DEFAULT_SLA, deriveEdgeStatus } from '../../domain/linkScoring';
import { defaultPriorityFor, serviceClassFromDscp } from '../../domain/policyTranslation';
import { applicationByFortinetId, applicationByKey } from '../applicationCatalog';
import type {
  FgtAddress,
  FgtEventLog,
  FgtFirewallPolicy,
  FgtHealthCheck,
  FgtHealthCheckMonitor,
  FgtInterface,
  FgtSdwanMember,
  FgtSdwanService,
  FgtService,
  FmgDevice,
} from './fortinetTypes';

/** Prefix for every object the portal creates, so it never touches operator-managed objects. */
export const OBJ_PREFIX = 'uniti_';
const PROTO_NUM: Record<string, number> = { TCP: 6, UDP: 17, ICMP: 1, ANY: 0 };

export function edgeIdFor(adom: string, deviceName: string): string {
  return `ft-${adom}-${deviceName}`;
}

export function firmwareString(d: Pick<FmgDevice, 'os_ver' | 'mr' | 'patch' | 'build'>): string {
  return `${d.os_ver}.${d.mr}.${d.patch}${d.build ? ` build${d.build}` : ''}`;
}

export function mapDeviceStatus(conn: FmgDevice['conn_status']): EdgeStatus {
  return conn === 1 ? 'UP' : conn === 2 ? 'DOWN' : 'UNKNOWN';
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
  const k = kind.toLowerCase();
  const transport: Transport =
    k === 'fibre' || k === 'fiber' || k === 'ftth'
      ? 'FIBRE'
      : k === 'broadband' || k === 'dsl' || k === 'fttc'
        ? 'BROADBAND'
        : k === 'lte' || k === '4g' || k === '5g'
          ? 'LTE'
          : k === 'mpls'
            ? 'MPLS'
            : 'UNKNOWN';
  return { transport, isp: isp || undefined };
}

export function linkStateFromMonitor(
  memberIf: string,
  member: FgtSdwanMember,
  monitor: FgtHealthCheckMonitor | undefined,
): LinkState {
  if (member.status === 'disable') return 'STANDBY';
  if (!monitor) return 'UNKNOWN';
  const statuses = Object.values(monitor)
    .map((hc) => hc[memberIf]?.status)
    .filter((s): s is 'up' | 'down' | 'error' => !!s);
  if (statuses.length === 0) return 'UNKNOWN';
  return statuses.some((s) => s === 'up') ? 'UP' : 'DOWN';
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
      const down = stats.status !== 'up';
      const sample: LinkSample = {
        edgeId,
        linkId: `${edgeId}:${memberIf}`,
        timestamp: atIso,
        latencyMs: down ? 0 : stats.latency ?? 0,
        jitterMs: down ? 0 : stats.jitter ?? 0,
        lossPct: down ? 100 : stats.packet_loss ?? 0,
        rxBps: (stats.rx_bandwidth ?? 0) * 1000,
        txBps: (stats.tx_bandwidth ?? 0) * 1000,
      };
      const prev = byMember.get(memberIf);
      if (!prev) {
        byMember.set(memberIf, sample);
      } else {
        byMember.set(memberIf, {
          ...prev,
          latencyMs: Math.max(prev.latencyMs, sample.latencyMs),
          jitterMs: Math.max(prev.jitterMs, sample.jitterMs),
          lossPct: Math.max(prev.lossPct, sample.lossPct),
          rxBps: Math.max(prev.rxBps, sample.rxBps),
          txBps: Math.max(prev.txBps, sample.txBps),
        });
      }
    }
  }
  return [...byMember.values()];
}

// ---------------------------------------------------------------------------
// Address / service objects
// ---------------------------------------------------------------------------

export function addressNameFor(cidr: string): string {
  const r = parseCidr(cidr);
  if (r.start === 0 && r.end === 0xffffffff) return 'all';
  const prefix = 32 - Math.log2(r.end - r.start + 1);
  return `${OBJ_PREFIX}net_${intToIp(r.start)}_${prefix}`;
}

export function addressObjectFor(cidr: string): FgtAddress | undefined {
  const name = addressNameFor(cidr);
  if (name === 'all') return undefined;
  const r = parseCidr(cidr);
  const prefix = 32 - Math.log2(r.end - r.start + 1);
  return { name, type: 'ipmask', subnet: [intToIp(r.start), prefixToNetmask(prefix)], comment: 'managed by Uniti self-care' };
}

export function cidrFromAddress(addr: FgtAddress | undefined, name: string): string | undefined {
  if (name === 'all') return undefined;
  if (!addr || addr.type !== 'ipmask' || !addr.subnet) {
    throw new Error(`address object "${name}" is not an ipmask address and cannot be represented`);
  }
  return `${addr.subnet[0]}/${netmaskToPrefix(addr.subnet[1])}`;
}

export function serviceNamesFor(protocol: FirewallRule['protocol'], ports: PortRange[]): string[] {
  if (protocol === 'ICMP') return ['ALL_ICMP'];
  if (ports.length === 0) return protocol === 'ANY' ? ['ALL'] : [`ALL_${protocol}`];
  const proto = protocol === 'ANY' ? 'any' : protocol.toLowerCase();
  return ports.map((p) => `${OBJ_PREFIX}${proto}_${p.from === p.to ? p.from : `${p.from}-${p.to}`}`);
}

export function serviceObjectFor(name: string): FgtService | undefined {
  const m = new RegExp(`^${OBJ_PREFIX}(tcp|udp|any)_(\\d+(?:-\\d+)?)$`).exec(name);
  if (!m) return undefined;
  const range = m[2];
  return {
    name,
    protocol: 'TCP/UDP/SCTP',
    ...(m[1] !== 'udp' ? { 'tcp-portrange': range } : {}),
    ...(m[1] !== 'tcp' ? { 'udp-portrange': range } : {}),
    comment: 'managed by Uniti self-care',
  };
}

export function protocolAndPortsFromServices(
  names: string[],
  services: Map<string, FgtService>,
): { protocol: FirewallRule['protocol']; ports: PortRange[] } {
  if (names.includes('ALL') || names.length === 0) return { protocol: 'ANY', ports: [] };
  if (names.includes('ALL_ICMP')) return { protocol: 'ICMP', ports: [] };
  if (names.includes('ALL_TCP')) return { protocol: 'TCP', ports: [] };
  if (names.includes('ALL_UDP')) return { protocol: 'UDP', ports: [] };
  const protos = new Set<string>();
  const ports: PortRange[] = [];
  for (const n of names) {
    const svc = services.get(n) ?? serviceObjectFor(n);
    if (!svc) throw new Error(`service object "${n}" not found`);
    const tcp = svc['tcp-portrange'];
    const udp = svc['udp-portrange'];
    if (tcp && udp) protos.add('ANY');
    else if (tcp) protos.add('TCP');
    else if (udp) protos.add('UDP');
    // FortiOS port ranges may carry ":<src-range>" after the destination range.
    const spec = (tcp ?? udp ?? '').split(' ').map((p) => p.split(':')[0]).join(',');
    ports.push(...parsePortList(spec));
  }
  const protocol = protos.size === 1 ? ([...protos][0] as FirewallRule['protocol']) : 'ANY';
  return { protocol, ports };
}

// ---------------------------------------------------------------------------
// Firewall
// ---------------------------------------------------------------------------

export interface FortiFirewallBundle {
  policies: FgtFirewallPolicy[];
  addresses: FgtAddress[];
  services: FgtService[];
}

export function firewallToForti(rules: FirewallRule[], firstPolicyId = 1000): FortiFirewallBundle {
  const addresses = new Map<string, FgtAddress>();
  const services = new Map<string, FgtService>();
  const policies = [...rules]
    .sort((a, b) => a.sequence - b.sequence)
    .map((r, i) => {
      const addrNames = (cidrs: string[]) => {
        if (cidrs.length === 0) return ['all'];
        return cidrs.map((c) => {
          const obj = addressObjectFor(c);
          if (obj) addresses.set(obj.name, obj);
          return addressNameFor(c);
        });
      };
      const svcNames = serviceNamesFor(r.protocol, r.destinationPorts);
      for (const n of svcNames) {
        const obj = serviceObjectFor(n);
        if (obj) services.set(n, obj);
      }
      return {
        policyid: firstPolicyId + i,
        name: r.name.slice(0, 35),
        status: r.enabled ? 'enable' : 'disable',
        srcintf: ['any'],
        dstintf: ['any'],
        srcaddr: addrNames(r.sourceCidrs),
        dstaddr: addrNames(r.destinationCidrs),
        service: svcNames,
        action: r.action === 'ALLOW' ? 'accept' : 'deny',
        schedule: 'always',
        logtraffic: r.log ? 'all' : 'disable',
        comments: `uniti:${r.id}`,
      } satisfies FgtFirewallPolicy;
    });
  return { policies, addresses: [...addresses.values()], services: [...services.values()] };
}

export function firewallFromForti(
  policies: FgtFirewallPolicy[],
  addresses: FgtAddress[],
  services: FgtService[],
): FirewallRule[] {
  const addrMap = new Map(addresses.map((a) => [a.name, a]));
  const svcMap = new Map(services.map((s) => [s.name, s]));
  return policies.map((p, i) => {
    const toCidrs = (names: string[]) =>
      names.map((n) => cidrFromAddress(addrMap.get(n), n)).filter((c): c is string => !!c);
    const { protocol, ports } = protocolAndPortsFromServices(p.service, svcMap);
    const idFromComment = /uniti:([\w-]+)/.exec(p.comments ?? '')?.[1];
    return {
      id: idFromComment ?? `ft-fw-${p.policyid}`,
      name: p.name || `policy-${p.policyid}`,
      sequence: (i + 1) * 10,
      enabled: p.status === 'enable',
      action: p.action === 'accept' ? 'ALLOW' : 'DENY',
      protocol,
      sourceCidrs: toCidrs(p.srcaddr),
      destinationCidrs: toCidrs(p.dstaddr),
      destinationPorts: ports,
      log: p.logtraffic !== 'disable',
    };
  });
}

// ---------------------------------------------------------------------------
// SD-WAN rules (business policies)
// ---------------------------------------------------------------------------

export interface FortiPolicyBundle {
  services: FgtSdwanService[];
  healthChecks: FgtHealthCheck[];
  addresses: FgtAddress[];
}

export const HEALTH_CHECK_SERVERS = ['8.8.8.8', '1.1.1.1'];

export function healthCheckNameFor(policy: BusinessPolicy): string {
  return policy.action.sla
    ? `${OBJ_PREFIX}hc_${policy.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
    : `${OBJ_PREFIX}hc_${policy.action.serviceClass.toLowerCase()}`;
}

function slaTarget(sla: SlaThresholds): FgtHealthCheck['sla'][number] {
  return {
    id: 1,
    'latency-threshold': Math.round(sla.maxLatencyMs),
    'jitter-threshold': Math.round(sla.maxJitterMs),
    'packetloss-threshold': Math.round(sla.maxLossPct),
  };
}

/** Encodes neutral fields FortiOS cannot hold natively into the rule comment. */
export function encodeComment(p: BusinessPolicy): string {
  return `uniti:id=${p.id};class=${p.action.serviceClass};prio=${p.action.priority}`;
}

export function decodeComment(comment: string | undefined): { id?: string; serviceClass?: ServiceClass; priority?: PolicyPriority } {
  if (!comment?.startsWith('uniti:')) return {};
  const kv = Object.fromEntries(
    comment
      .slice(6)
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  );
  return {
    id: kv.id,
    serviceClass: ['REALTIME', 'TRANSACTIONAL', 'BULK'].includes(kv.class) ? (kv.class as ServiceClass) : undefined,
    priority: ['HIGH', 'NORMAL', 'LOW'].includes(kv.prio) ? (kv.prio as PolicyPriority) : undefined,
  };
}

function dscpBits(dscp: number): string {
  return dscp.toString(2).padStart(6, '0');
}

export interface MemberInfo {
  seq: number;
  transport: Transport;
}

/**
 * Orders SD-WAN members for transport steering. PREFERRED puts members of the
 * preferred transport first and keeps the rest as fallback; MANDATORY keeps only the
 * preferred transport (traffic is dropped rather than failing over).
 */
export function priorityMembersFor(policy: BusinessPolicy, members: MemberInfo[]): number[] {
  const all = members.map((m) => m.seq);
  const want = policy.action.preferredTransport;
  if (!want) return all;
  const preferred = members.filter((m) => m.transport === want).map((m) => m.seq);
  if (policy.action.steering === 'MANDATORY_TRANSPORT') {
    if (preferred.length === 0) throw new Error(`policy "${policy.name}" requires ${want} but the edge has no ${want} link`);
    return preferred;
  }
  return [...preferred, ...all.filter((s) => !preferred.includes(s))];
}

export function policiesToForti(policies: BusinessPolicy[], members: MemberInfo[], firstId = 100): FortiPolicyBundle {
  const services: FgtSdwanService[] = [];
  const healthChecks = new Map<string, FgtHealthCheck>();
  const addresses = new Map<string, FgtAddress>();
  const memberSeqs = members.map((m) => m.seq);

  const addrNames = (cidrs?: string[]) => {
    if (!cidrs?.length) return ['all'];
    return cidrs.map((c) => {
      const obj = addressObjectFor(c);
      if (obj) addresses.set(obj.name, obj);
      return addressNameFor(c);
    });
  };

  for (const p of [...policies].sort((a, b) => a.order - b.order)) {
    const hcName = healthCheckNameFor(p);
    if (!healthChecks.has(hcName)) {
      healthChecks.set(hcName, {
        name: hcName,
        server: HEALTH_CHECK_SERVERS,
        protocol: 'ping',
        members: memberSeqs,
        sla: [slaTarget(p.action.sla ?? DEFAULT_SLA[p.action.serviceClass])],
      });
    }
    const appIds = (p.match.applications ?? []).map((k) => {
      const def = applicationByKey(k);
      if (!def) throw new Error(`application "${k}" is not in the catalogue`);
      return def.fortinetAppId;
    });
    const ports: Array<PortRange | undefined> = p.match.destinationPorts?.length ? p.match.destinationPorts : [undefined];
    const mode: FgtSdwanService['mode'] =
      p.action.steering === 'LOAD_BALANCE'
        ? 'load-balance'
        : p.action.steering === 'BEST_PATH'
          ? 'sla'
          : 'manual';
    const remark = p.action.dscpRemark;

    ports.forEach((range, i) => {
      services.push({
        id: firstId + services.length,
        name: ports.length > 1 ? `${p.name}#${i + 1}` : p.name,
        status: p.enabled ? 'enable' : 'disable',
        mode,
        src: addrNames(p.match.sourceCidrs),
        dst: addrNames(p.match.destinationCidrs),
        protocol: PROTO_NUM[p.match.protocol ?? 'ANY'],
        'start-port': range?.from ?? 1,
        'end-port': range?.to ?? 65535,
        'internet-service': appIds.length ? 'enable' : 'disable',
        'internet-service-app-ctrl': appIds,
        'priority-members': mode === 'manual' ? priorityMembersFor(p, members) : memberSeqs,
        ...(mode === 'sla' ? { sla: [{ 'health-check': hcName, id: 1 }] } : { 'health-check': [hcName] }),
        'dscp-forward': remark !== undefined ? 'enable' : 'disable',
        ...(remark !== undefined ? { 'dscp-forward-tag': dscpBits(remark) } : {}),
        ...(p.match.dscp !== undefined ? { tos: `0x${(p.match.dscp << 2).toString(16).padStart(2, '0')}`, 'tos-mask': '0xfc' } : {}),
        comment: encodeComment(p),
      });
    });
  }
  return { services, healthChecks: [...healthChecks.values()], addresses: [...addresses.values()] };
}

export function policiesFromForti(
  services: FgtSdwanService[],
  healthChecks: FgtHealthCheck[],
  addresses: FgtAddress[],
  members: MemberInfo[],
): BusinessPolicy[] {
  const hcMap = new Map(healthChecks.map((h) => [h.name, h]));
  const addrMap = new Map(addresses.map((a) => [a.name, a]));
  const transportBySeq = new Map(members.map((m) => [m.seq, m.transport]));
  const groups = new Map<string, FgtSdwanService[]>();
  for (const s of services) {
    const base = s.name.replace(/#\d+$/, '');
    const list = groups.get(base);
    if (list) list.push(s);
    else groups.set(base, [s]);
  }

  return [...groups.entries()].map(([name, group], i) => {
    const first = group[0];
    const meta = decodeComment(first.comment);
    const hcName = first.sla?.[0]?.['health-check'] ?? first['health-check']?.[0];
    const hc = hcName ? hcMap.get(hcName) : undefined;
    const target = hc?.sla[0];
    const tosDscp = first.tos ? parseInt(first.tos, 16) >> 2 : undefined;
    const remark = first['dscp-forward'] === 'enable' && first['dscp-forward-tag'] ? parseInt(first['dscp-forward-tag'], 2) : undefined;
    const serviceClass = meta.serviceClass ?? serviceClassFromDscp(remark ?? tosDscp) ?? 'TRANSACTIONAL';
    const toCidrs = (names: string[]) => names.map((n) => cidrFromAddress(addrMap.get(n), n)).filter((c): c is string => !!c);
    const proto = Object.entries(PROTO_NUM).find(([, v]) => v === first.protocol)?.[0] as BusinessPolicy['match']['protocol'];
    const ports = group
      .filter((s) => !(s['start-port'] === 1 && s['end-port'] === 65535))
      .map((s) => ({ from: s['start-port'], to: s['end-port'] }));

    let steering: BusinessPolicy['action']['steering'] = 'BEST_PATH';
    let preferredTransport: Transport | undefined;
    if (first.mode === 'load-balance') steering = 'LOAD_BALANCE';
    else if (first.mode === 'manual' || first.mode === 'priority') {
      const prio = first['priority-members'];
      const firstTransport = transportBySeq.get(prio[0]);
      const allSame = prio.every((s) => transportBySeq.get(s) === firstTransport);
      steering = allSame && prio.length < members.length ? 'MANDATORY_TRANSPORT' : 'PREFERRED_TRANSPORT';
      preferredTransport = firstTransport && firstTransport !== 'UNKNOWN' ? firstTransport : undefined;
    }

    const sla: SlaThresholds | undefined = target
      ? { maxLatencyMs: target['latency-threshold'], maxJitterMs: target['jitter-threshold'], maxLossPct: target['packetloss-threshold'] }
      : undefined;
    const classDefault = DEFAULT_SLA[serviceClass];
    const isDefault =
      sla &&
      sla.maxLatencyMs === classDefault.maxLatencyMs &&
      sla.maxJitterMs === classDefault.maxJitterMs &&
      sla.maxLossPct === classDefault.maxLossPct;

    return {
      id: meta.id ?? `ft-sdwan-${first.id}`,
      name,
      order: (i + 1) * 10,
      enabled: first.status === 'enable',
      match: {
        applications: first['internet-service-app-ctrl'].length
          ? first['internet-service-app-ctrl'].map((id) => applicationByFortinetId(id)?.key ?? `fgt-app-${id}`)
          : undefined,
        sourceCidrs: (() => {
          const c = toCidrs(first.src);
          return c.length ? c : undefined;
        })(),
        destinationCidrs: (() => {
          const c = toCidrs(first.dst);
          return c.length ? c : undefined;
        })(),
        protocol: proto ?? 'ANY',
        destinationPorts: ports.length ? ports : undefined,
        dscp: tosDscp,
      },
      action: {
        serviceClass,
        priority: meta.priority ?? defaultPriorityFor(serviceClass),
        steering,
        preferredTransport,
        sla: isDefault ? undefined : sla,
        dscpRemark: remark,
      },
    };
  });
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

export function mapEventLog(adom: string, accountId: string, device: string, log: FgtEventLog): SdwanEvent {
  const category: SdwanEvent['category'] = log.cfgpath
    ? 'CONFIG'
    : log.subtype === 'sdwan'
      ? 'LINK'
      : log.subtype === 'ha'
        ? 'EDGE'
        : log.subtype === 'vpn' || log.subtype === 'user'
          ? 'SECURITY'
          : 'SYSTEM';
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
