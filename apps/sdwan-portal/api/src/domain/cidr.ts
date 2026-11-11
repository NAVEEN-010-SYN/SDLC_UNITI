import type { PortRange } from './types';

export interface Ipv4Range {
  start: number;
  end: number;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function ipToInt(ip: string): number {
  const m = IPV4.exec(ip.trim());
  if (!m) throw new Error(`invalid IPv4 address "${ip}"`);
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) throw new Error(`invalid IPv4 address "${ip}"`);
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isValidCidr(cidr: string): boolean {
  try {
    parseCidr(cidr);
    return true;
  } catch {
    return false;
  }
}

/** Parses "10.0.0.0/8", a bare host "10.0.0.1" (=/32) or "any" (=0.0.0.0/0). */
export function parseCidr(cidr: string): Ipv4Range {
  const value = cidr.trim().toLowerCase();
  if (value === 'any' || value === 'all') return { start: 0, end: 0xffffffff };
  const [ip, prefixStr] = value.split('/');
  const prefix = prefixStr === undefined ? 32 : Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`invalid prefix in "${cidr}"`);
  const base = ipToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = (base & mask) >>> 0;
  if (start !== base) throw new Error(`"${cidr}" has host bits set; did you mean ${intToIp(start)}/${prefix}?`);
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

/** Converts a dotted netmask ("255.255.255.0") into a prefix length; FortiOS uses this form. */
export function netmaskToPrefix(mask: string): number {
  const n = ipToInt(mask);
  const inverted = ~n >>> 0;
  if ((inverted & (inverted + 1)) !== 0) throw new Error(`non-contiguous netmask "${mask}"`);
  let bits = 0;
  for (let v = n; v; v = (v << 1) >>> 0) bits++;
  return bits;
}

export function prefixToNetmask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

export function rangeContains(outer: Ipv4Range, inner: Ipv4Range): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function rangesOverlap(a: Ipv4Range, b: Ipv4Range): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** True when every CIDR in `inner` is fully covered by at least one CIDR in `outer`. Empty list means "any". */
export function cidrSetCovers(outer: string[], inner: string[]): boolean {
  const o = outer.length ? outer.map(parseCidr) : [parseCidr('any')];
  const i = inner.length ? inner.map(parseCidr) : [parseCidr('any')];
  return i.every((ir) => o.some((or) => rangeContains(or, ir)));
}

export function cidrSetsOverlap(a: string[], b: string[]): boolean {
  const ar = a.length ? a.map(parseCidr) : [parseCidr('any')];
  const br = b.length ? b.map(parseCidr) : [parseCidr('any')];
  return ar.some((x) => br.some((y) => rangesOverlap(x, y)));
}

export function portSetCovers(outer: PortRange[], inner: PortRange[]): boolean {
  if (outer.length === 0) return true;
  if (inner.length === 0) return false;
  return inner.every((ir) => outer.some((or) => or.from <= ir.from && or.to >= ir.to));
}

export function portSetsOverlap(a: PortRange[], b: PortRange[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((x) => b.some((y) => x.from <= y.to && y.from <= x.to));
}

/** Parses "443", "8000-8080" or "80,443,1000-2000" into ranges. */
export function parsePortList(spec: string): PortRange[] {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.toLowerCase() === 'any') return [];
  return trimmed.split(/[,\s]+/).map((part) => {
    const [a, b] = part.split(/[-:]/).map((p) => Number(p));
    const from = a;
    const to = b === undefined ? a : b;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 65535 || from > to) {
      throw new Error(`invalid port range "${part}"`);
    }
    return { from, to };
  });
}

export function formatPortList(ranges: PortRange[]): string {
  if (ranges.length === 0) return 'any';
  return ranges.map((r) => (r.from === r.to ? String(r.from) : `${r.from}-${r.to}`)).join(',');
}
