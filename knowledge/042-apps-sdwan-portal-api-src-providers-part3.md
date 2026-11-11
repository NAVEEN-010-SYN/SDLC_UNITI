# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src/providers (part 3 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 8

## Files

- `apps/sdwan-portal/api/src/providers/fortinet/fortinetMappers.ts` (596 lines)
- `apps/sdwan-portal/api/src/providers/fortinet/fortinetTypes.ts` (171 lines)
- `apps/sdwan-portal/api/src/providers/http/HttpClient.ts` (146 lines)
- `apps/sdwan-portal/api/src/providers/http/backoff.ts` (78 lines)
- `apps/sdwan-portal/api/src/providers/mock/MockProvider.ts` (250 lines)
- `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudAdapter.ts` (260 lines)
- `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.test.ts` (65 lines)
- `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.ts` (122 lines)

## apps/sdwan-portal/api/src/providers/fortinet/fortinetMappers.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/fortinet/fortinetMappers.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/providers/fortinet/fortinetTypes.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/fortinet/fortinetTypes.ts`.

```typescript
/**
 * Subset of FortiManager JSON-RPC and FortiOS REST shapes consumed by the adapter.
 * Hyphenated keys mirror the FortiOS CLI attribute names, as the APIs return them.
 */

export interface FmgStatus {
  code: number;
  message: string;
}

export interface FmgResult<T> {
  status: FmgStatus;
  url: string;
  data?: T;
}

export interface FmgResponse<T> {
  id: number;
  result: Array<FmgResult<T>>;
  session?: string;
}

export interface FmgDevice {
  name: string;
  sn: string;
  platform_str: string;
  os_ver: number;
  mr: number;
  patch: number;
  build?: number;
  /** 1 = connected, 2 = down, 0 = unknown. */
  conn_status: 0 | 1 | 2;
  /** 0 = standalone, 1 = active-passive, 2 = active-active. */
  ha_mode: 0 | 1 | 2;
  ha_slave?: Array<{ name: string; sn: string; role: 'master' | 'slave' | 'primary' | 'secondary'; status: 0 | 1 }>;
  last_checked?: number;
  desc?: string;
  'meta fields'?: Record<string, string>;
}

export interface FmgDeviceGroup {
  name: string;
  desc?: string;
  'object member'?: Array<{ name: string; vdom?: string }>;
}

export interface FgtInterface {
  name: string;
  role: 'wan' | 'lan' | 'dmz' | 'undefined';
  description?: string;
  ip?: [string, string];
  status?: 'up' | 'down';
  'estimated-upstream-bandwidth'?: number;
  'estimated-downstream-bandwidth'?: number;
  alias?: string;
}

export interface FgtSdwanMember {
  'seq-num': number;
  interface: string;
  status: 'enable' | 'disable';
  gateway?: string;
  cost?: number;
  zone?: string;
  comment?: string;
}

export interface FgtSlaTarget {
  id: number;
  'latency-threshold': number;
  'jitter-threshold': number;
  'packetloss-threshold': number;
}

export interface FgtHealthCheck {
  name: string;
  server: string[];
  protocol: 'ping' | 'http' | 'dns' | 'twamp';
  members: number[];
  sla: FgtSlaTarget[];
}

export type FgtServiceMode = 'auto' | 'manual' | 'priority' | 'sla' | 'load-balance';

export interface FgtSdwanService {
  id: number;
  name: string;
  status: 'enable' | 'disable';
  mode: FgtServiceMode;
  /** Address object names; "all" when unrestricted. */
  src: string[];
  dst: string[];
  protocol: number;
  'start-port': number;
  'end-port': number;
  'internet-service': 'enable' | 'disable';
  'internet-service-app-ctrl': number[];
  'priority-members': number[];
  'health-check'?: string[];
  sla?: Array<{ 'health-check': string; id: number }>;
  'dscp-forward': 'enable' | 'disable';
  'dscp-forward-tag'?: string;
  tos?: string;
  'tos-mask'?: string;
  /** Free text; the portal stores neutral metadata the vendor cannot express here. */
  comment?: string;
}

export interface FgtAddress {
  name: string;
  type: 'ipmask' | 'iprange' | 'fqdn';
  subnet?: [string, string];
  comment?: string;
}

export interface FgtService {
  name: string;
  protocol: 'TCP/UDP/SCTP' | 'ICMP' | 'IP';
  'tcp-portrange'?: string;
  'udp-portrange'?: string;
  comment?: string;
}

export interface FgtFirewallPolicy {
  policyid: number;
  name: string;
  status: 'enable' | 'disable';
  srcintf: string[];
  dstintf: string[];
  srcaddr: string[];
  dstaddr: string[];
  service: string[];
  action: 'accept' | 'deny';
  schedule: string;
  logtraffic: 'all' | 'utm' | 'disable';
  comments?: string;
}

/** /api/v2/monitor/virtual-wan/health-check result: health-check name → member interface → stats. */
export type FgtHealthCheckMonitor = Record<
  string,
  Record<
    string,
    {
      status: 'up' | 'down' | 'error';
      latency?: number;
      jitter?: number;
      packet_loss?: number;
      tx_bandwidth?: number;
      rx_bandwidth?: number;
      state_changed?: number;
    }
  >
>;

export interface FgtEventLog {
  eventtime: number;
  logid: string;
  level: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'information' | 'debug';
  subtype: 'system' | 'sdwan' | 'ha' | 'vpn' | 'user' | 'router';
  logdesc: string;
  msg: string;
  cfgpath?: string;
}

export interface FgtProxyResponse<T> {
  target: string;
  status: FmgStatus;
  response?: { http_status: number; results: T; status: 'success' | 'error' };
}
```

## apps/sdwan-portal/api/src/providers/http/HttpClient.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/http/HttpClient.ts`.

```typescript
import { UpstreamProblem, UpstreamTimeoutProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import { currentCorrelationId } from '../../logging/logger';
import { backoffDelay, CircuitBreaker, parseRetryAfter, sleep } from './backoff';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  vendor: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  logger: Logger;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  random?: () => number;
  breaker?: CircuitBreaker;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Whether the request may be retried. Defaults to true for GET and for POSTs the
   * caller marks idempotent (VCO read methods and JSON-RPC "get" are POSTs).
   */
  idempotent?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * JSON HTTP client shared by the vendor clients: per-attempt timeout via AbortController,
 * retry with full-jitter exponential backoff (honouring Retry-After), a circuit breaker,
 * correlation-id propagation and structured logging of every upstream call.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  readonly breaker: CircuitBreaker;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleepImpl = opts.sleepImpl ?? sleep;
    this.breaker = opts.breaker ?? new CircuitBreaker();
  }

  buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    const url = new URL(base + (path.startsWith('/') ? path : `/${path}`));
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async request<T>(req: RequestOptions): Promise<HttpResponse<T>> {
    const method = req.method ?? 'GET';
    const idempotent = req.idempotent ?? method === 'GET';
    const maxAttempts = idempotent ? this.opts.maxRetries + 1 : 1;
    const url = this.buildUrl(req.path, req.query);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!this.breaker.canRequest()) {
        throw new UpstreamProblem(
          this.opts.vendor,
          `circuit open after repeated failures; retry in ${Math.ceil(this.breaker.retryInMs() / 1000)}s`,
          true,
        );
      }
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(currentCorrelationId() ? { 'X-Correlation-Id': currentCorrelationId()! } : {}),
            ...this.opts.defaultHeaders,
            ...req.headers,
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        });
        clearTimeout(timer);
        const elapsedMs = Date.now() - started;
        this.opts.logger.debug('upstream call', { vendor: this.opts.vendor, method, path: req.path, status: res.status, elapsedMs, attempt });

        if (res.ok) {
          this.breaker.recordSuccess();
          const text = await res.text();
          return { status: res.status, headers: res.headers, data: (text ? JSON.parse(text) : undefined) as T };
        }

        const bodyText = await res.text().catch(() => '');
        const retryable = RETRYABLE_STATUS.has(res.status);
        if (res.status >= 500) this.breaker.recordFailure();
        lastError = new UpstreamProblem(
          this.opts.vendor,
          `${method} ${req.path} returned HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
          retryable,
          res.status,
        );
        if (!retryable || attempt === maxAttempts - 1) throw lastError;
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        await this.sleepImpl(retryAfter ?? this.delay(attempt));
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof UpstreamProblem && (!err.retryable || attempt === maxAttempts - 1)) throw err;
        if (err instanceof UpstreamProblem) {
          lastError = err;
          continue;
        }
        this.breaker.recordFailure();
        const aborted = (err as Error)?.name === 'AbortError';
        lastError = aborted
          ? new UpstreamTimeoutProblem(this.opts.vendor, this.opts.timeoutMs)
          : new UpstreamProblem(this.opts.vendor, `${method} ${req.path} failed: ${(err as Error)?.message ?? err}`, true);
        this.opts.logger.warn('upstream call failed', { vendor: this.opts.vendor, path: req.path, attempt, aborted });
        if (attempt === maxAttempts - 1) throw lastError;
        await this.sleepImpl(this.delay(attempt));
      }
    }
    throw lastError ?? new UpstreamProblem(this.opts.vendor, 'request failed');
  }

  private delay(attempt: number): number {
    return backoffDelay(attempt, { baseMs: this.opts.backoffBaseMs, maxMs: this.opts.backoffMaxMs, random: this.opts.random });
  }
}
```

## apps/sdwan-portal/api/src/providers/http/backoff.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/http/backoff.ts`.

```typescript
export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** Random source in [0,1); injectable for deterministic tests. */
  random?: () => number;
}

/**
 * "Full jitter" exponential backoff (AWS architecture blog): sleep a random amount in
 * [0, min(max, base * 2^attempt)]. Spreads retries from many pollers hitting the same
 * controller so they do not synchronise into bursts.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions): number {
  const rnd = opts.random ?? Math.random;
  const ceiling = Math.min(opts.maxMs, opts.baseMs * 2 ** Math.max(0, attempt));
  return Math.floor(rnd() * ceiling);
}

/**
 * Parses a Retry-After header (delta-seconds or HTTP date). Returns milliseconds,
 * or undefined if absent/unparseable.
 */
export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Minimal circuit breaker. After `failureThreshold` consecutive failures the circuit
 * opens and calls fail fast for `cooldownMs`; the next call after cooldown is a trial
 * (half-open) whose outcome closes or re-opens the circuit. Protects a degraded vendor
 * controller from being hammered by the metrics poller.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    if (this.openedAt === null) return 'CLOSED';
    return this.now() - this.openedAt >= this.cooldownMs ? 'HALF_OPEN' : 'OPEN';
  }

  canRequest(): boolean {
    return this.state !== 'OPEN';
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    if (this.state === 'HALF_OPEN') {
      this.openedAt = this.now();
      return;
    }
    this.failures++;
    if (this.failures >= this.failureThreshold) this.openedAt = this.now();
  }

  retryInMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.cooldownMs - (this.now() - this.openedAt));
  }
}
```

## apps/sdwan-portal/api/src/providers/mock/MockProvider.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/mock/MockProvider.ts`.

```typescript
import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent, Vendor, WanLink } from '../../domain/types';
import { NotFoundProblem } from '../../errors/problem';
import type { ApplyResult, ConfigSnapshot, DiscoveredSite, ProviderContext, SdwanProvider, TimeRange } from '../SdwanProvider';

/** Deterministic 32-bit hash → [0,1). Same input always produces the same metric. */
function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

interface MockSiteDef {
  key: string;
  name: string;
  city: string;
  postcode: string;
  edges: Array<{ key: string; model: string; ha: boolean; links: Array<Pick<WanLink, 'interface' | 'transport' | 'ispName' | 'bandwidthDownKbps' | 'bandwidthUpKbps'>> }>;
}

const SITES: MockSiteDef[] = [
  {
    key: 'hq',
    name: 'Head Office',
    city: 'Leeds',
    postcode: 'LS1 4AP',
    edges: [
      {
        key: 'hq-edge-1',
        model: 'edge840',
        ha: true,
        links: [
          { interface: 'GE3', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 1_000_000, bandwidthUpKbps: 1_000_000 },
          { interface: 'GE4', transport: 'BROADBAND', ispName: 'Openreach FTTC', bandwidthDownKbps: 80_000, bandwidthUpKbps: 20_000 },
        ],
      },
    ],
  },
  {
    key: 'branch-north',
    name: 'Branch – York',
    city: 'York',
    postcode: 'YO1 7HH',
    edges: [
      {
        key: 'york-edge-1',
        model: 'edge610',
        ha: false,
        links: [
          { interface: 'GE1', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 500_000, bandwidthUpKbps: 500_000 },
          { interface: 'CELL1', transport: 'LTE', ispName: 'EE', bandwidthDownKbps: 50_000, bandwidthUpKbps: 15_000 },
        ],
      },
    ],
  },
  {
    key: 'branch-south',
    name: 'Branch – Sheffield',
    city: 'Sheffield',
    postcode: 'S1 2HE',
    edges: [
      {
        key: 'sheff-edge-1',
        model: 'edge510',
        ha: false,
        links: [{ interface: 'GE1', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 300_000, bandwidthUpKbps: 300_000 }],
      },
    ],
  },
];

/**
 * In-memory provider used in development (`SDWAN_PROVIDER_MODE=mock`) and in route
 * tests. Policies and firewall rules are stored per edge so apply/list round-trips
 * behave like a real controller.
 */
export class MockProvider implements SdwanProvider {
  private readonly policies = new Map<string, BusinessPolicy[]>();
  private readonly firewall = new Map<string, FirewallRule[]>();
  private readonly versions = new Map<string, string>();
  readonly calls: Array<{ method: string; edge?: string }> = [];

  constructor(readonly vendor: Vendor) {}

  private prefix(ctx: ProviderContext): string {
    return `${this.vendor === 'VELOCLOUD' ? 'vc' : 'ft'}-${ctx.tenant}`;
  }

  private findEdgeDef(edgeVendorId: string) {
    for (const s of SITES) {
      const e = s.edges.find((x) => x.key === edgeVendorId);
      if (e) return { site: s, edge: e };
    }
    throw new NotFoundProblem('Edge', edgeVendorId);
  }

  async listSites(): Promise<DiscoveredSite[]> {
    return SITES.map((s) => ({
      vendorId: s.key,
      name: s.name,
      address: { line1: `1 ${s.name} Street`, city: s.city, postcode: s.postcode, country: 'GB' },
      edgeVendorIds: s.edges.map((e) => e.key),
    }));
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    return SITES.flatMap((s) => s.edges.map((e) => this.buildEdge(ctx, s, e)));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const { site, edge } = this.findEdgeDef(edgeVendorId);
    return this.buildEdge(ctx, site, edge);
  }

  private buildEdge(ctx: ProviderContext, site: MockSiteDef, def: MockSiteDef['edges'][number]): Edge {
    const id = `${this.prefix(ctx)}-${def.key}`;
    const lteDown = def.key === 'york-edge-1' && hashUnit(`${id}:${new Date().toISOString().slice(0, 13)}`) < 0.2;
    return {
      id,
      siteId: `${this.prefix(ctx)}-site-${site.key}`,
      accountId: ctx.accountId,
      vendor: this.vendor,
      vendorRef: { vendor: this.vendor, tenant: ctx.tenant, id: def.key },
      name: def.key,
      model: this.vendor === 'VELOCLOUD' ? def.model : def.model.replace('edge', 'FGT-'),
      serialNumber: `SN${Math.floor(hashUnit(id) * 1e8)}`,
      softwareVersion: this.versions.get(id) ?? (this.vendor === 'VELOCLOUD' ? '5.2.1' : '7.2.8'),
      status: lteDown ? 'DEGRADED' : 'UP',
      haState: def.ha ? 'ACTIVE' : 'STANDALONE',
      lastContact: new Date().toISOString(),
      links: def.links.map((l) => ({
        ...l,
        id: `${id}:${l.interface}`,
        edgeId: id,
        name: l.interface,
        state: lteDown && l.transport === 'LTE' ? 'DOWN' : 'UP',
      })),
    };
  }

  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const step = 5 * 60_000;
    const from = Math.ceil(Date.parse(range.from) / step) * step;
    const to = Date.parse(range.to);
    const out: LinkSample[] = [];
    for (const link of edge.links) {
      const baseLatency = link.transport === 'FIBRE' ? 8 : link.transport === 'BROADBAND' ? 22 : 55;
      for (let t = from; t <= to; t += step) {
        const r = hashUnit(`${link.id}:${t}`);
        const spike = r > 0.97;
        out.push({
          edgeId: edge.id,
          linkId: link.id,
          timestamp: new Date(t).toISOString(),
          latencyMs: Math.round((baseLatency * (1 + r * 0.6) + (spike ? 180 : 0)) * 10) / 10,
          jitterMs: Math.round((baseLatency * 0.1 + r * 4 + (spike ? 35 : 0)) * 10) / 10,
          lossPct: spike ? Math.round(r * 300) / 100 : r > 0.9 ? 0.2 : 0,
          rxBps: Math.round(link.bandwidthDownKbps * 1000 * (0.15 + 0.5 * hashUnit(`${link.id}:rx:${t}`))),
          txBps: Math.round(link.bandwidthUpKbps * 1000 * (0.1 + 0.4 * hashUnit(`${link.id}:tx:${t}`))),
        });
      }
    }
    return out;
  }

  async listBusinessPolicies(_ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    this.findEdgeDef(edgeVendorId);
    return structuredClone(this.policies.get(edgeVendorId) ?? []);
  }

  async applyBusinessPolicies(_ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    this.findEdgeDef(edgeVendorId);
    this.calls.push({ method: 'applyBusinessPolicies', edge: edgeVendorId });
    this.policies.set(edgeVendorId, structuredClone(policies));
    return { applied: policies.length, warnings: [] };
  }

  async listFirewallRules(_ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    this.findEdgeDef(edgeVendorId);
    return structuredClone(this.firewall.get(edgeVendorId) ?? []);
  }

  async applyFirewallRules(_ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    this.findEdgeDef(edgeVendorId);
    this.calls.push({ method: 'applyFirewallRules', edge: edgeVendorId });
    this.firewall.set(edgeVendorId, structuredClone(rules));
    return { applied: rules.length, warnings: [] };
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    return {
      content: {
        format: 'mock',
        policies: this.policies.get(edgeVendorId) ?? [],
        firewall: this.firewall.get(edgeVendorId) ?? [],
      },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(_ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    this.calls.push({ method: 'restoreConfig', edge: edgeVendorId });
    this.policies.set(edgeVendorId, structuredClone((snapshot.content.policies as BusinessPolicy[]) ?? []));
    this.firewall.set(edgeVendorId, structuredClone((snapshot.content.firewall as FirewallRule[]) ?? []));
    return { applied: 2, warnings: [] };
  }

  async rebootEdge(_ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    this.calls.push({ method: 'rebootEdge', edge: edgeVendorId });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    this.calls.push({ method: 'upgradeEdge', edge: edgeVendorId });
    this.versions.set(`${this.prefix(ctx)}-${edgeVendorId}`, targetVersion);
    return { applied: 1, warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const edges = await this.listEdges(ctx);
    const hour = 3_600_000;
    const out: SdwanEvent[] = [];
    for (let t = Math.ceil(Date.parse(range.from) / hour) * hour; t <= Date.parse(range.to); t += hour) {
      for (const e of edges) {
        const r = hashUnit(`${e.id}:ev:${t}`);
        if (r < 0.92) continue;
        out.push({
          id: `${e.id}-ev-${t}`,
          accountId: ctx.accountId,
          edgeId: e.id,
          vendor: this.vendor,
          occurredAt: new Date(t).toISOString(),
          category: r > 0.98 ? 'EDGE' : 'LINK',
          severity: r > 0.98 ? 'MAJOR' : 'MINOR',
          message: r > 0.98 ? `${e.name} HA heartbeat lost for 12s` : `${e.links[0].name} path quality degraded`,
        });
      }
    }
    return out;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
```

## apps/sdwan-portal/api/src/providers/velocloud/VeloCloudAdapter.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudAdapter.ts`.

```typescript
import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent } from '../../domain/types';
import { NotFoundProblem, UpstreamProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import type {
  ApplyResult,
  ConfigSnapshot,
  DiscoveredSite,
  ProviderContext,
  SdwanProvider,
  TimeRange,
} from '../SdwanProvider';
import { VeloCloudClient } from './VeloCloudClient';
import {
  firewallFromVco,
  firewallToVco,
  mapEdge,
  mapEvent,
  mapLinkSeries,
  policiesFromVco,
  policiesToVco,
} from './velocloudMappers';
import type {
  VcoConfigModule,
  VcoConfigProfile,
  VcoEdge,
  VcoEvent,
  VcoFirewallModuleData,
  VcoLinkSeries,
  VcoQosModuleData,
} from './velocloudTypes';

const LINK_METRICS = ['bestLatencyMsRx', 'bestJitterMsRx', 'bestLossPctRx', 'bytesRx', 'bytesTx'] as const;
/** Only the global segment is customer-managed in the managed service. */
const GLOBAL_SEGMENT_ID = 0;

export class VeloCloudAdapter implements SdwanProvider {
  readonly vendor = 'VELOCLOUD' as const;

  constructor(
    private readonly client: VeloCloudClient,
    private readonly logger: Logger,
  ) {}

  private enterpriseId(ctx: ProviderContext): number {
    const id = Number(ctx.tenant);
    if (!Number.isInteger(id) || id <= 0) throw new UpstreamProblem('VELOCLOUD', `invalid enterpriseId "${ctx.tenant}"`);
    return id;
  }

  private async fetchEdges(ctx: ProviderContext): Promise<VcoEdge[]> {
    return this.client.call<VcoEdge[]>('enterprise/getEnterpriseEdges', {
      enterpriseId: this.enterpriseId(ctx),
      with: ['site', 'links', 'ha'],
    });
  }

  async listSites(ctx: ProviderContext): Promise<DiscoveredSite[]> {
    const edges = await this.fetchEdges(ctx);
    const sites = new Map<number, DiscoveredSite>();
    for (const e of edges) {
      const existing = sites.get(e.siteId);
      if (existing) {
        existing.edgeVendorIds.push(String(e.id));
        continue;
      }
      sites.set(e.siteId, {
        vendorId: String(e.siteId),
        name: e.site?.name ?? e.name,
        address: e.site
          ? {
              line1: e.site.streetAddress ?? '',
              city: e.site.city ?? '',
              postcode: e.site.postalCode ?? '',
              country: e.site.country ?? 'GB',
            }
          : undefined,
        edgeVendorIds: [String(e.id)],
      });
    }
    return [...sites.values()];
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    const edges = await this.fetchEdges(ctx);
    return edges.map((e) => mapEdge(ctx.tenant, ctx.accountId, `vc-site-${ctx.tenant}-${e.siteId}`, e));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const edge = await this.client.call<VcoEdge | null>('edge/getEdge', {
      enterpriseId: this.enterpriseId(ctx),
      id: Number(edgeVendorId),
      with: ['site', 'links', 'ha'],
    });
    if (!edge) throw new NotFoundProblem('Edge', edgeVendorId);
    return mapEdge(ctx.tenant, ctx.accountId, `vc-site-${ctx.tenant}-${edge.siteId}`, edge);
  }

  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const series = await this.client.call<VcoLinkSeries[]>('metrics/getEdgeLinkSeries', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
      interval: { start: Date.parse(range.from), end: Date.parse(range.to) },
      metrics: LINK_METRICS,
    });
    return mapLinkSeries(edge.id, series ?? []);
  }

  private async configStack(ctx: ProviderContext, edgeVendorId: string): Promise<VcoConfigProfile[]> {
    const stack = await this.client.call<VcoConfigProfile[]>('edge/getEdgeConfigurationStack', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
    });
    if (!stack?.length) throw new UpstreamProblem('VELOCLOUD', `edge ${edgeVendorId} returned an empty configuration stack`);
    return stack;
  }

  /**
   * The effective module is the edge-specific override (stack[0]) when present, else the
   * profile's (stack[1]). Writes always go to the edge-specific profile so one customer
   * site never changes a shared profile.
   */
  private effectiveModule(stack: VcoConfigProfile[], name: VcoConfigModule['name']): VcoConfigModule | undefined {
    return stack[0].modules.find((m) => m.name === name) ?? stack[1]?.modules.find((m) => m.name === name);
  }

  private edgeModule(stack: VcoConfigProfile[], name: VcoConfigModule['name'], edgeVendorId: string): VcoConfigModule {
    const mod = stack[0].modules.find((m) => m.name === name);
    if (!mod) {
      throw new UpstreamProblem(
        'VELOCLOUD',
        `edge ${edgeVendorId} has no edge-specific ${name} module; enable edge override in VCO first`,
      );
    }
    return mod;
  }

  async listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const data = this.effectiveModule(stack, 'QOS')?.data as VcoQosModuleData | undefined;
    const segment = data?.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    return policiesFromVco(segment?.rules ?? []);
  }

  async applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const mod = this.edgeModule(stack, 'QOS', edgeVendorId);
    const data = structuredClone(mod.data) as unknown as VcoQosModuleData;
    const rules = policiesToVco(policies);
    const segment = data.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    if (segment) segment.rules = rules;
    else data.segments.push({ segment: { segmentId: GLOBAL_SEGMENT_ID, name: 'Global Segment' }, rules });
    await this.updateModule(ctx, mod.id, data as unknown as Record<string, unknown>);
    const warnings = rules.length > policies.length ? [`${policies.length} policies expanded into ${rules.length} VCO rules`] : [];
    return { applied: rules.length, warnings };
  }

  async listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const data = this.effectiveModule(stack, 'firewall')?.data as VcoFirewallModuleData | undefined;
    const segment = data?.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    return firewallFromVco(segment?.outbound ?? []);
  }

  async applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const mod = this.edgeModule(stack, 'firewall', edgeVendorId);
    const data = structuredClone(mod.data) as unknown as VcoFirewallModuleData;
    const vcoRules = firewallToVco(rules);
    const segment = data.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    if (segment) segment.outbound = vcoRules;
    else data.segments.push({ segment: { segmentId: GLOBAL_SEGMENT_ID, name: 'Global Segment' }, outbound: vcoRules });
    data.firewall_enabled = true;
    await this.updateModule(ctx, mod.id, data as unknown as Record<string, unknown>);
    return { applied: vcoRules.length, warnings: [] };
  }

  private async updateModule(ctx: ProviderContext, moduleId: number, data: Record<string, unknown>): Promise<void> {
    const res = await this.client.call<{ rows: number }>('configuration/updateConfigurationModule', {
      enterpriseId: this.enterpriseId(ctx),
      configurationModuleId: moduleId,
      _update: { data },
    });
    if (!res || res.rows < 1) {
      throw new UpstreamProblem('VELOCLOUD', `configuration module ${moduleId} update affected no rows`);
    }
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const [stack, edge] = await Promise.all([this.configStack(ctx, edgeVendorId), this.getEdge(ctx, edgeVendorId)]);
    const edgeProfile = stack[0];
    return {
      content: {
        format: 'vco-edge-profile',
        profileId: edgeProfile.id,
        modules: edgeProfile.modules.map((m) => ({ id: m.id, name: m.name, version: m.version, data: m.data })),
      },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    if (snapshot.content.format !== 'vco-edge-profile') {
      throw new UpstreamProblem('VELOCLOUD', 'snapshot is not a VeloCloud edge profile backup');
    }
    const stack = await this.configStack(ctx, edgeVendorId);
    const current = new Map(stack[0].modules.map((m) => [m.name, m]));
    const saved = snapshot.content.modules as Array<Pick<VcoConfigModule, 'name' | 'data'>>;
    const warnings: string[] = [];
    let applied = 0;
    for (const mod of saved) {
      const target = current.get(mod.name);
      if (!target) {
        warnings.push(`module ${mod.name} no longer exists on the edge profile; skipped`);
        continue;
      }
      await this.updateModule(ctx, target.id, mod.data);
      applied++;
    }
    this.logger.info('vco config restored', { edgeVendorId, applied, skipped: warnings.length });
    return { applied, warnings };
  }

  async rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    await this.client.call('edge/rebootEdge', { enterpriseId: this.enterpriseId(ctx), edgeId: Number(edgeVendorId) });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    const res = await this.client.call<{ taskId?: string }>('edge/updateEdgeSoftwareImage', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
      softwareVersion: targetVersion,
    });
    return { applied: 1, taskId: res?.taskId, warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const [res, edges] = await Promise.all([
      this.client.call<{ data: VcoEvent[] }>('event/getEnterpriseEvents', {
        enterpriseId: this.enterpriseId(ctx),
        interval: { start: Date.parse(range.from), end: Date.parse(range.to) },
      }),
      this.fetchEdges(ctx),
    ]);
    const byName = new Map(edges.map((e) => [e.name, `vc-${ctx.tenant}-${e.logicalId}`]));
    return (res?.data ?? []).map((ev) => mapEvent(ctx.tenant, ctx.accountId, ev, byName));
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.client.hasSession) await this.client.login();
      return true;
    } catch (err) {
      this.logger.warn('vco ping failed', { err });
      return false;
    }
  }
}
```

## apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.test.ts`.

```typescript
import { requestContext, silentLogger } from '../../logging/logger';
import { fakeFetch, FakeReply, noSleep } from '../../testing/fakeFetch';
import { VcoRpcError, VeloCloudClient } from './VeloCloudClient';

const login: FakeReply = { body: {}, headers: { 'set-cookie': 'velocloud.session=abc123; Path=/; HttpOnly' } };

function client(replies: FakeReply[]) {
  const fake = fakeFetch(replies);
  const vco = new VeloCloudClient(
    { baseUrl: 'https://vco.test/', timeoutMs: 1000, maxRetries: 2, backoffBaseMs: 1, backoffMaxMs: 1, logger: silentLogger, fetchImpl: fake.fetch, sleepImpl: noSleep },
    { username: 'svc', password: 'secret', loginType: 'operator' },
  );
  return { vco, calls: fake.calls };
}

describe('VeloCloudClient', () => {
  it('logs in once, then sends the session cookie and correlation id on every call', async () => {
    const { vco, calls } = client([login, { body: [{ id: 1 }] }, { body: [{ id: 2 }] }]);
    await requestContext.run({ correlationId: 'corr-12345678' }, async () => {
      await vco.call('enterprise/getEnterpriseEdges', { enterpriseId: 7 });
      await vco.call('enterprise/getEnterpriseEdges', { enterpriseId: 7 });
    });
    expect(calls.map((c) => c.url)).toEqual([
      'https://vco.test/portal/rest/login/operatorLogin',
      'https://vco.test/portal/rest/enterprise/getEnterpriseEdges',
      'https://vco.test/portal/rest/enterprise/getEnterpriseEdges',
    ]);
    expect(calls[1].headers).toMatchObject({ Cookie: 'velocloud.session=abc123', 'X-Correlation-Id': 'corr-12345678' });
    expect(calls[0].body).toEqual({ username: 'svc', password: 'secret' });
  });

  it('re-authenticates once when VCO reports the session is no longer valid', async () => {
    const { vco, calls } = client([
      login,
      { body: { error: { code: -32000, message: 'session not valid' } } },
      login,
      { body: { ok: true } },
    ]);
    await expect(vco.call('edge/getEdge', { id: 1 })).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(4);
  });

  it('surfaces other RPC errors without retrying', async () => {
    const { vco } = client([login, { body: { error: { code: -32602, message: 'invalid params' } } }]);
    const err = await vco.call('edge/getEdge', {}).catch((e) => e);
    expect(err).toBeInstanceOf(VcoRpcError);
    expect(err).toMatchObject({ code: -32602, status: 502 });
  });

  it('retries idempotent reads on 503 but never retries a write', async () => {
    const read = client([login, { status: 503 }, { body: { ok: 1 } }]);
    await expect(read.vco.call('metrics/getEdgeLinkSeries', {})).resolves.toEqual({ ok: 1 });

    const write = client([login, { status: 503 }]);
    await expect(write.vco.call('configuration/updateConfigurationModule', {})).rejects.toMatchObject({ status: 502 });
    expect(write.calls).toHaveLength(2);
  });

  it('fails login loudly when no session cookie comes back', async () => {
    const { vco } = client([{ body: {} }]);
    await expect(vco.login()).rejects.toThrow(/no session cookie/);
    expect(vco.hasSession).toBe(false);
  });
});
```

## apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/velocloud/VeloCloudClient.ts`.

```typescript
import { HttpClient, HttpClientOptions } from '../http/HttpClient';
import { ProblemError, UpstreamProblem } from '../../errors/problem';
import type { VcoErrorBody } from './velocloudTypes';

export interface VeloCloudCredentials {
  username: string;
  password: string;
  /** Operator logins can act across enterprises; enterprise logins are bound to one. */
  loginType: 'operator' | 'enterprise';
}

/** Methods that only read state and can be retried safely. */
const READ_METHODS = /^(enterprise\/getEnterprise|edge\/getEdge|metrics\/|event\/get|configuration\/getConfiguration|link\/get)/;

/**
 * VCO portal API client. VCO authenticates with a session cookie ("velocloud.session")
 * issued by /login/*Login; we keep it in memory, share one in-flight login across
 * concurrent callers, and transparently re-login once if a call reports the session
 * expired (HTTP 401/403 or an RPC error code -32000 "session not valid").
 */
export class VeloCloudClient {
  private sessionCookie: string | null = null;
  private loginInFlight: Promise<string> | null = null;
  private readonly http: HttpClient;

  constructor(
    httpOptions: Omit<HttpClientOptions, 'vendor'>,
    private readonly credentials: VeloCloudCredentials,
  ) {
    this.http = new HttpClient({ ...httpOptions, vendor: 'VELOCLOUD' });
  }

  get hasSession(): boolean {
    return this.sessionCookie !== null;
  }

  async login(): Promise<string> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = (async () => {
      const path = this.credentials.loginType === 'operator' ? '/portal/rest/login/operatorLogin' : '/portal/rest/login/enterpriseLogin';
      const res = await this.http.request<unknown>({
        method: 'POST',
        path,
        body: { username: this.credentials.username, password: this.credentials.password },
        idempotent: true,
      });
      const setCookie = res.headers.get('set-cookie') ?? '';
      const match = /velocloud\.session=([^;]+)/.exec(setCookie);
      if (!match) throw new UpstreamProblem('VELOCLOUD', 'login succeeded but no session cookie was returned');
      this.sessionCookie = match[1];
      return this.sessionCookie;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async logout(): Promise<void> {
    if (!this.sessionCookie) return;
    try {
      await this.http.request({ method: 'POST', path: '/portal/rest/logout', body: {}, headers: this.cookieHeader() });
    } finally {
      this.sessionCookie = null;
    }
  }

  /** Invokes a portal API method, e.g. call('enterprise/getEnterpriseEdges', {...}). */
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.sessionCookie) await this.login();
    try {
      return await this.invoke<T>(method, params);
    } catch (err) {
      if (this.isSessionExpired(err)) {
        this.sessionCookie = null;
        await this.login();
        return this.invoke<T>(method, params);
      }
      throw err;
    }
  }

  private async invoke<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await this.http.request<T & VcoErrorBody>({
      method: 'POST',
      path: `/portal/rest/${method}`,
      body: params,
      headers: this.cookieHeader(),
      idempotent: READ_METHODS.test(method),
    });
    const body = res.data as VcoErrorBody | undefined;
    if (body && typeof body === 'object' && !Array.isArray(body) && body.error) {
      throw new VcoRpcError(method, body.error.code, body.error.message);
    }
    return res.data as T;
  }

  private cookieHeader(): Record<string, string> {
    return this.sessionCookie ? { Cookie: `velocloud.session=${this.sessionCookie}` } : {};
  }

  private isSessionExpired(err: unknown): boolean {
    if (err instanceof VcoRpcError) return err.code === -32000 || /session/i.test(err.rpcMessage);
    if (err instanceof ProblemError) {
      const status = err.extensions.upstreamStatus;
      return status === 401 || status === 403;
    }
    return false;
  }
}

export class VcoRpcError extends UpstreamProblem {
  constructor(
    public readonly method: string,
    public readonly code: number,
    public readonly rpcMessage: string,
  ) {
    super('VELOCLOUD', `${method} failed with VCO error ${code}: ${rpcMessage}`, false);
  }
}
```
