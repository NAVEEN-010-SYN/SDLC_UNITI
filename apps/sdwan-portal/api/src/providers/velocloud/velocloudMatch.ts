import type { FirewallRule, PortRange, Transport } from '../../domain/types';
import { parseCidr, intToIp, netmaskToPrefix, prefixToNetmask } from '../../domain/cidr';
import { applicationByKey, applicationByVelocloudId } from '../applicationCatalog';
import type { VcoLink, VcoRuleMatch } from './velocloudTypes';

// ---------------------------------------------------------------------------
// Match translation (shared by QoS and firewall rules)
// ---------------------------------------------------------------------------

export const VCO_ANY = -1;
const FULL_MASK = '255.255.255.255';

const PROTO_TO_NUM: Record<string, number> = { TCP: 6, UDP: 17, ICMP: 1, ANY: VCO_ANY };
const NUM_TO_PROTO: Record<number, FirewallRule['protocol']> = { 6: 'TCP', 17: 'UDP', 1: 'ICMP' };

/** VCO only distinguishes wired/wireless/private; the provisioning tag tells us fibre vs broadband. */
export function mapTransport(link: Pick<VcoLink, 'networkType' | 'linkTag'>): Transport {
  const tag = (link.linkTag ?? '').toLowerCase();
  if (link.networkType === 'WIRELESS' || tag.includes('lte') || tag.includes('5g')) return 'LTE';
  if (link.networkType === 'PRIVATE' || tag.includes('mpls')) return 'MPLS';
  if (tag.includes('fibre') || tag.includes('fiber') || tag.includes('ftth')) return 'FIBRE';
  if (tag.includes('broadband') || tag.includes('dsl') || tag.includes('fttc')) return 'BROADBAND';
  return link.networkType === 'ETHERNET' ? 'BROADBAND' : 'UNKNOWN';
}

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

export interface ExpandInput {
  applications?: string[];
  sourceCidrs?: string[];
  destinationCidrs?: string[];
  protocol?: string;
  destinationPorts?: PortRange[];
  dscp?: number;
}

export interface FoldedMatch extends ExpandInput {
  protocol: FirewallRule['protocol'];
}

/** Returns the list, or a single "undefined" entry meaning "any" when it is empty. */
function orAny<T>(list: T[] | undefined): Array<T | undefined> {
  if (list && list.length) return list;
  return [undefined];
}

function velocloudAppId(app: string | undefined): number {
  if (!app) return VCO_ANY;
  const appDef = applicationByKey(app);
  if (!appDef) throw new Error(`application "${app}" is not in the catalogue`);
  return appDef.velocloudAppId;
}

/**
 * A VCO rule matches a single app, a single source/destination subnet and a single
 * port range. A neutral rule with lists expands into the cartesian product; each
 * expanded VCO rule is named "<name>#<n>" so it can be folded back on read.
 */
export function expandMatch(m: ExpandInput): VcoRuleMatch[] {
  const out: VcoRuleMatch[] = [];
  const proto = PROTO_TO_NUM[m.protocol ?? 'ANY'] ?? VCO_ANY;
  for (const app of orAny(m.applications)) {
    const appid = velocloudAppId(app);
    for (const s of orAny(m.sourceCidrs)) {
      const src = cidrToVco(s);
      for (const d of orAny(m.destinationCidrs)) {
        const dst = cidrToVco(d);
        for (const p of orAny(m.destinationPorts)) {
          const match = blankMatch();
          match.appid = appid;
          match.dscp = m.dscp ?? VCO_ANY;
          match.sip = src.ip;
          match.ssm = src.mask;
          match.dip = dst.ip;
          match.dsm = dst.mask;
          match.dport_low = p ? p.from : VCO_ANY;
          match.dport_high = p ? p.to : VCO_ANY;
          match.proto = proto;
          out.push(match);
        }
      }
    }
  }
  return out;
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function foldApplications(matches: VcoRuleMatch[]): string[] {
  const ids: number[] = [];
  for (const m of matches) {
    if (m.appid !== VCO_ANY) ids.push(m.appid);
  }
  return uniq(ids).map((id) => applicationByVelocloudId(id)?.key ?? `vco-app-${id}`);
}

function foldCidrs(matches: VcoRuleMatch[], side: 'src' | 'dst'): string[] {
  const cidrs: string[] = [];
  for (const m of matches) {
    const c = side === 'src' ? vcoToCidr(m.sip, m.ssm) : vcoToCidr(m.dip, m.dsm);
    if (c) cidrs.push(c);
  }
  return uniq(cidrs);
}

function foldPorts(matches: VcoRuleMatch[]): PortRange[] {
  const keys: string[] = [];
  for (const m of matches) {
    if (m.dport_low === VCO_ANY) continue;
    const high = m.dport_high === VCO_ANY ? m.dport_low : m.dport_high;
    keys.push(`${m.dport_low}-${high}`);
  }
  return uniq(keys).map((k) => {
    const [from, to] = k.split('-').map(Number);
    return { from, to };
  });
}

function undefinedIfEmpty<T>(list: T[]): T[] | undefined {
  return list.length ? list : undefined;
}

/** Folds a group of expanded VCO matches back into one neutral match. */
export function foldMatches(matches: VcoRuleMatch[]): FoldedMatch {
  const withDscp = matches.find((m) => m.dscp !== VCO_ANY);
  const firstProto = matches[0]?.proto;
  return {
    applications: undefinedIfEmpty(foldApplications(matches)),
    sourceCidrs: undefinedIfEmpty(foldCidrs(matches, 'src')),
    destinationCidrs: undefinedIfEmpty(foldCidrs(matches, 'dst')),
    destinationPorts: undefinedIfEmpty(foldPorts(matches)),
    protocol: NUM_TO_PROTO[firstProto] ?? 'ANY',
    dscp: withDscp?.dscp,
  };
}

export interface ExpandedGroup<T> {
  name: string;
  index: number;
  members: T[];
}

/** Groups VCO rules named "base#n" by base name, preserving first-seen order. */
export function groupExpanded<T extends { name: string }>(rules: T[]): Array<ExpandedGroup<T>> {
  const groups = new Map<string, ExpandedGroup<T>>();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const base = r.name.replace(/#\d+$/, '');
    const g = groups.get(base);
    if (g) g.members.push(r);
    else groups.set(base, { name: base, index: i, members: [r] });
  }
  return [...groups.values()];
}

export function expandedName(base: string, i: number, total: number): string {
  return total === 1 ? base : `${base}#${i + 1}`;
}

export function slug(s: string): string {
  const dashed = s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return dashed.replace(/^-|-$/g, '');
}
