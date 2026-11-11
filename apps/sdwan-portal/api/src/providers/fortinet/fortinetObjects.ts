import type { FirewallRule, PortRange } from '../../domain/types';
import { intToIp, netmaskToPrefix, parseCidr, prefixToNetmask, parsePortList } from '../../domain/cidr';
import type { FgtAddress, FgtFirewallPolicy, FgtService } from './fortinetTypes';

/** Prefix for every object the portal creates, so it never touches operator-managed objects. */
export const OBJ_PREFIX = 'uniti_';
export const PROTO_NUM: Record<string, number> = { TCP: 6, UDP: 17, ICMP: 1, ANY: 0 };

const MANAGED_COMMENT = 'managed by Uniti self-care';

// ---------------------------------------------------------------------------
// Address / service objects
// ---------------------------------------------------------------------------

function prefixLengthOf(start: number, end: number): number {
  return 32 - Math.log2(end - start + 1);
}

export function addressNameFor(cidr: string): string {
  const r = parseCidr(cidr);
  if (r.start === 0 && r.end === 0xffffffff) return 'all';
  const prefix = prefixLengthOf(r.start, r.end);
  return `${OBJ_PREFIX}net_${intToIp(r.start)}_${prefix}`;
}

export function addressObjectFor(cidr: string): FgtAddress | undefined {
  const name = addressNameFor(cidr);
  if (name === 'all') return undefined;
  const r = parseCidr(cidr);
  const prefix = prefixLengthOf(r.start, r.end);
  return { name, type: 'ipmask', subnet: [intToIp(r.start), prefixToNetmask(prefix)], comment: MANAGED_COMMENT };
}

export function cidrFromAddress(addr: FgtAddress | undefined, name: string): string | undefined {
  if (name === 'all') return undefined;
  if (!addr || addr.type !== 'ipmask' || !addr.subnet) {
    throw new Error(`address object "${name}" is not an ipmask address and cannot be represented`);
  }
  return `${addr.subnet[0]}/${netmaskToPrefix(addr.subnet[1])}`;
}

/** Converts CIDRs to address object names, collecting any objects that must be created. */
export function addressNamesFor(cidrs: string[] | undefined, collected: Map<string, FgtAddress>): string[] {
  if (!cidrs || cidrs.length === 0) return ['all'];
  const names: string[] = [];
  for (const c of cidrs) {
    const obj = addressObjectFor(c);
    if (obj) collected.set(obj.name, obj);
    names.push(addressNameFor(c));
  }
  return names;
}

/** Resolves address object names back to CIDRs, dropping "all". */
export function cidrsFromAddressNames(names: string[], addrMap: Map<string, FgtAddress>): string[] {
  const cidrs: string[] = [];
  for (const n of names) {
    const c = cidrFromAddress(addrMap.get(n), n);
    if (c) cidrs.push(c);
  }
  return cidrs;
}

export function serviceNamesFor(protocol: FirewallRule['protocol'], ports: PortRange[]): string[] {
  if (protocol === 'ICMP') return ['ALL_ICMP'];
  if (ports.length === 0) return protocol === 'ANY' ? ['ALL'] : [`ALL_${protocol}`];
  const proto = protocol === 'ANY' ? 'any' : protocol.toLowerCase();
  return ports.map((p) => {
    const range = p.from === p.to ? String(p.from) : `${p.from}-${p.to}`;
    return `${OBJ_PREFIX}${proto}_${range}`;
  });
}

/** Parses "<prefix><proto>_<from>[-<to>]" into its protocol and port range parts. */
function parseServiceName(name: string): { proto: string; range: string } | undefined {
  if (!name.startsWith(OBJ_PREFIX)) return undefined;
  const rest = name.slice(OBJ_PREFIX.length);
  const sep = rest.indexOf('_');
  if (sep < 0) return undefined;
  const proto = rest.slice(0, sep);
  const range = rest.slice(sep + 1);
  if (proto !== 'tcp' && proto !== 'udp' && proto !== 'any') return undefined;
  if (!/^\d+(-\d+)?$/.test(range)) return undefined;
  return { proto, range };
}

export function serviceObjectFor(name: string): FgtService | undefined {
  const parsed = parseServiceName(name);
  if (!parsed) return undefined;
  const svc: FgtService = { name, protocol: 'TCP/UDP/SCTP' };
  if (parsed.proto !== 'udp') svc['tcp-portrange'] = parsed.range;
  if (parsed.proto !== 'tcp') svc['udp-portrange'] = parsed.range;
  svc.comment = MANAGED_COMMENT;
  return svc;
}

/** FortiOS port ranges may carry ":<src-range>" after the destination range. */
function destinationPortSpec(range: string): string {
  const parts = range.split(' ');
  const dest: string[] = [];
  for (const p of parts) dest.push(p.split(':')[0]);
  return dest.join(',');
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
    ports.push(...parsePortList(destinationPortSpec(tcp ?? udp ?? '')));
  }
  let protocol: FirewallRule['protocol'] = 'ANY';
  if (protos.size === 1) protocol = [...protos][0] as FirewallRule['protocol'];
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
  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);
  const policies: FgtFirewallPolicy[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const svcNames = serviceNamesFor(r.protocol, r.destinationPorts);
    for (const n of svcNames) {
      const obj = serviceObjectFor(n);
      if (obj) services.set(n, obj);
    }
    policies.push({
      policyid: firstPolicyId + i,
      name: r.name.slice(0, 35),
      status: r.enabled ? 'enable' : 'disable',
      srcintf: ['any'],
      dstintf: ['any'],
      srcaddr: addressNamesFor(r.sourceCidrs, addresses),
      dstaddr: addressNamesFor(r.destinationCidrs, addresses),
      service: svcNames,
      action: r.action === 'ALLOW' ? 'accept' : 'deny',
      schedule: 'always',
      logtraffic: r.log ? 'all' : 'disable',
      comments: `uniti:${r.id}`,
    });
  }
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
    const { protocol, ports } = protocolAndPortsFromServices(p.service, svcMap);
    const idMatch = /uniti:([\w-]+)/.exec(p.comments ?? '');
    const idFromComment = idMatch ? idMatch[1] : undefined;
    return {
      id: idFromComment ?? `ft-fw-${p.policyid}`,
      name: p.name || `policy-${p.policyid}`,
      sequence: (i + 1) * 10,
      enabled: p.status === 'enable',
      action: p.action === 'accept' ? 'ALLOW' : 'DENY',
      protocol,
      sourceCidrs: cidrsFromAddressNames(p.srcaddr, addrMap),
      destinationCidrs: cidrsFromAddressNames(p.dstaddr, addrMap),
      destinationPorts: ports,
      log: p.logtraffic !== 'disable',
    };
  });
}
