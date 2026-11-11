import type {
  BusinessPolicy,
  PolicyPriority,
  PortRange,
  ServiceClass,
  SlaThresholds,
  Transport,
} from '../../domain/types';
import { DEFAULT_SLA } from '../../domain/linkScoring';
import { defaultPriorityFor, serviceClassFromDscp } from '../../domain/policyTranslation';
import { applicationByFortinetId, applicationByKey } from '../applicationCatalog';
import { OBJ_PREFIX, PROTO_NUM, addressNamesFor, cidrsFromAddressNames } from './fortinetObjects';
import type { FgtAddress, FgtHealthCheck, FgtSdwanService, FgtServiceMode, FgtSlaTarget } from './fortinetTypes';

// ---------------------------------------------------------------------------
// SD-WAN rules (business policies)
// ---------------------------------------------------------------------------

export interface FortiPolicyBundle {
  services: FgtSdwanService[];
  healthChecks: FgtHealthCheck[];
  addresses: FgtAddress[];
}

export interface MemberInfo {
  seq: number;
  transport: Transport;
}

type Steering = BusinessPolicy['action']['steering'];

export const HEALTH_CHECK_SERVERS = ['8.8.8.8', '1.1.1.1'];

const SERVICE_CLASSES = ['REALTIME', 'TRANSACTIONAL', 'BULK'];
const PRIORITIES = ['HIGH', 'NORMAL', 'LOW'];

export function healthCheckNameFor(policy: BusinessPolicy): string {
  if (policy.action.sla) {
    const safeId = policy.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
    return `${OBJ_PREFIX}hc_${safeId}`;
  }
  return `${OBJ_PREFIX}hc_${policy.action.serviceClass.toLowerCase()}`;
}

function slaTarget(sla: SlaThresholds): FgtSlaTarget {
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
  if (!comment || !comment.startsWith('uniti:')) return {};
  const kv: Record<string, string> = {};
  for (const part of comment.slice(6).split(';')) {
    const [key, value] = part.split('=');
    kv[key] = value;
  }
  return {
    id: kv.id,
    serviceClass: SERVICE_CLASSES.includes(kv.class) ? (kv.class as ServiceClass) : undefined,
    priority: PRIORITIES.includes(kv.prio) ? (kv.prio as PolicyPriority) : undefined,
  };
}

function dscpBits(dscp: number): string {
  return dscp.toString(2).padStart(6, '0');
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
  const preferred: number[] = [];
  for (const m of members) {
    if (m.transport === want) preferred.push(m.seq);
  }
  if (policy.action.steering === 'MANDATORY_TRANSPORT') {
    if (preferred.length === 0) throw new Error(`policy "${policy.name}" requires ${want} but the edge has no ${want} link`);
    return preferred;
  }
  const fallback = all.filter((s) => !preferred.includes(s));
  return [...preferred, ...fallback];
}

function serviceModeFor(steering: Steering): FgtServiceMode {
  if (steering === 'LOAD_BALANCE') return 'load-balance';
  if (steering === 'BEST_PATH') return 'sla';
  return 'manual';
}

function fortinetAppIdsFor(policy: BusinessPolicy): number[] {
  const ids: number[] = [];
  for (const key of policy.match.applications ?? []) {
    const def = applicationByKey(key);
    if (!def) throw new Error(`application "${key}" is not in the catalogue`);
    ids.push(def.fortinetAppId);
  }
  return ids;
}

/** Builds one FortiOS SD-WAN service entry for a policy and (optional) port range. */
function buildSdwanService(
  p: BusinessPolicy,
  id: number,
  name: string,
  range: PortRange | undefined,
  ctx: { hcName: string; appIds: number[]; members: MemberInfo[]; addresses: Map<string, FgtAddress> },
): FgtSdwanService {
  const mode = serviceModeFor(p.action.steering);
  const remark = p.action.dscpRemark;
  const memberSeqs = ctx.members.map((m) => m.seq);
  const svc: FgtSdwanService = {
    id,
    name,
    status: p.enabled ? 'enable' : 'disable',
    mode,
    src: addressNamesFor(p.match.sourceCidrs, ctx.addresses),
    dst: addressNamesFor(p.match.destinationCidrs, ctx.addresses),
    protocol: PROTO_NUM[p.match.protocol ?? 'ANY'],
    'start-port': range?.from ?? 1,
    'end-port': range?.to ?? 65535,
    'internet-service': ctx.appIds.length ? 'enable' : 'disable',
    'internet-service-app-ctrl': ctx.appIds,
    'priority-members': mode === 'manual' ? priorityMembersFor(p, ctx.members) : memberSeqs,
    'dscp-forward': remark !== undefined ? 'enable' : 'disable',
  };
  if (mode === 'sla') svc.sla = [{ 'health-check': ctx.hcName, id: 1 }];
  else svc['health-check'] = [ctx.hcName];
  if (remark !== undefined) svc['dscp-forward-tag'] = dscpBits(remark);
  if (p.match.dscp !== undefined) {
    svc.tos = `0x${(p.match.dscp << 2).toString(16).padStart(2, '0')}`;
    svc['tos-mask'] = '0xfc';
  }
  svc.comment = encodeComment(p);
  return svc;
}

export function policiesToForti(policies: BusinessPolicy[], members: MemberInfo[], firstId = 100): FortiPolicyBundle {
  const services: FgtSdwanService[] = [];
  const healthChecks = new Map<string, FgtHealthCheck>();
  const addresses = new Map<string, FgtAddress>();
  const memberSeqs = members.map((m) => m.seq);
  const sorted = [...policies].sort((a, b) => a.order - b.order);

  for (const p of sorted) {
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
    const ctx = { hcName, appIds: fortinetAppIdsFor(p), members, addresses };
    const portList = p.match.destinationPorts;
    const ranges: Array<PortRange | undefined> = portList && portList.length ? portList : [undefined];
    for (let i = 0; i < ranges.length; i++) {
      const name = ranges.length > 1 ? `${p.name}#${i + 1}` : p.name;
      services.push(buildSdwanService(p, firstId + services.length, name, ranges[i], ctx));
    }
  }
  return { services, healthChecks: [...healthChecks.values()], addresses: [...addresses.values()] };
}

/** Groups split services ("name#1", "name#2") back under their base policy name. */
function groupServicesByPolicy(services: FgtSdwanService[]): Map<string, FgtSdwanService[]> {
  const groups = new Map<string, FgtSdwanService[]>();
  for (const s of services) {
    const base = s.name.replace(/#\d+$/, '');
    const list = groups.get(base);
    if (list) list.push(s);
    else groups.set(base, [s]);
  }
  return groups;
}

function steeringFromService(
  svc: FgtSdwanService,
  transportBySeq: Map<number, Transport>,
  memberCount: number,
): { steering: Steering; preferredTransport?: Transport } {
  if (svc.mode === 'load-balance') return { steering: 'LOAD_BALANCE' };
  if (svc.mode !== 'manual' && svc.mode !== 'priority') return { steering: 'BEST_PATH' };
  const prio = svc['priority-members'];
  const firstTransport = transportBySeq.get(prio[0]);
  const allSame = prio.every((s) => transportBySeq.get(s) === firstTransport);
  const steering: Steering = allSame && prio.length < memberCount ? 'MANDATORY_TRANSPORT' : 'PREFERRED_TRANSPORT';
  const preferredTransport = firstTransport && firstTransport !== 'UNKNOWN' ? firstTransport : undefined;
  return { steering, preferredTransport };
}

/** Returns the SLA only when it differs from the service-class default. */
function customSla(target: FgtSlaTarget | undefined, serviceClass: ServiceClass): SlaThresholds | undefined {
  if (!target) return undefined;
  const sla: SlaThresholds = {
    maxLatencyMs: target['latency-threshold'],
    maxJitterMs: target['jitter-threshold'],
    maxLossPct: target['packetloss-threshold'],
  };
  const d = DEFAULT_SLA[serviceClass];
  const isDefault = sla.maxLatencyMs === d.maxLatencyMs && sla.maxJitterMs === d.maxJitterMs && sla.maxLossPct === d.maxLossPct;
  return isDefault ? undefined : sla;
}

function protocolFromNumber(num: number): BusinessPolicy['match']['protocol'] {
  for (const [name, value] of Object.entries(PROTO_NUM)) {
    if (value === num) return name as BusinessPolicy['match']['protocol'];
  }
  return 'ANY';
}

function portsFromGroup(group: FgtSdwanService[]): PortRange[] | undefined {
  const ports: PortRange[] = [];
  for (const s of group) {
    const isAnyPort = s['start-port'] === 1 && s['end-port'] === 65535;
    if (!isAnyPort) ports.push({ from: s['start-port'], to: s['end-port'] });
  }
  return ports.length ? ports : undefined;
}

function applicationKeysFor(appIds: number[]): string[] | undefined {
  if (!appIds.length) return undefined;
  return appIds.map((id) => applicationByFortinetId(id)?.key ?? `fgt-app-${id}`);
}

function nonEmpty(list: string[]): string[] | undefined {
  return list.length ? list : undefined;
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
  const groups = groupServicesByPolicy(services);

  const result: BusinessPolicy[] = [];
  let i = 0;
  for (const [name, group] of groups) {
    const first = group[0];
    const meta = decodeComment(first.comment);
    const hcName = first.sla?.[0]?.['health-check'] ?? first['health-check']?.[0];
    const hc = hcName ? hcMap.get(hcName) : undefined;
    const tosDscp = first.tos ? parseInt(first.tos, 16) >> 2 : undefined;
    const hasRemark = first['dscp-forward'] === 'enable' && first['dscp-forward-tag'];
    const remark = hasRemark ? parseInt(first['dscp-forward-tag'] as string, 2) : undefined;
    const serviceClass = meta.serviceClass ?? serviceClassFromDscp(remark ?? tosDscp) ?? 'TRANSACTIONAL';
    const { steering, preferredTransport } = steeringFromService(first, transportBySeq, members.length);

    result.push({
      id: meta.id ?? `ft-sdwan-${first.id}`,
      name,
      order: (i + 1) * 10,
      enabled: first.status === 'enable',
      match: {
        applications: applicationKeysFor(first['internet-service-app-ctrl']),
        sourceCidrs: nonEmpty(cidrsFromAddressNames(first.src, addrMap)),
        destinationCidrs: nonEmpty(cidrsFromAddressNames(first.dst, addrMap)),
        protocol: protocolFromNumber(first.protocol),
        destinationPorts: portsFromGroup(group),
        dscp: tosDscp,
      },
      action: {
        serviceClass,
        priority: meta.priority ?? defaultPriorityFor(serviceClass),
        steering,
        preferredTransport,
        sla: customSla(hc?.sla[0], serviceClass),
        dscpRemark: remark,
      },
    });
    i++;
  }
  return result;
}
