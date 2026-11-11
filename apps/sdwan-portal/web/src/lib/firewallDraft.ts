import type { FirewallRule, PortRange, Protocol } from '../api/types';

/** Raw form values for one firewall rule, as typed by the user. */
export interface FirewallRuleForm {
  name: string;
  action: 'ALLOW' | 'DENY';
  protocol: Protocol;
  sources: string;
  destinations: string;
  ports: string;
  log: boolean;
}

export const EMPTY_RULE_FORM: FirewallRuleForm = {
  name: '',
  action: 'ALLOW',
  protocol: 'TCP',
  sources: '',
  destinations: '',
  ports: '',
  log: false,
};

export type FormErrors = Partial<Record<keyof FirewallRuleForm, string>>;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Accepts a bare address (treated as /32) or CIDR; rejects host bits set beyond the prefix. */
export function normalizeCidr(input: string): string | null {
  const [ip, prefixRaw] = input.trim().split('/');
  if (!IPV4.test(ip)) return null;
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32 || (prefixRaw !== undefined && !/^\d{1,2}$/.test(prefixRaw))) return null;
  const n = ip.split('.').reduce((acc, o) => acc * 256 + Number(o), 0);
  const hostBits = 32 - prefix;
  if (hostBits > 0 && n % 2 ** hostBits !== 0) return null;
  return `${ip}/${prefix}`;
}

function parseCidrList(raw: string): { cidrs: string[]; bad?: string } {
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 1 && parts[0].toLowerCase() === 'any') return { cidrs: ['0.0.0.0/0'] };
  const cidrs: string[] = [];
  for (const p of parts) {
    const c = normalizeCidr(p);
    if (!c) return { cidrs, bad: p };
    cidrs.push(c);
  }
  return { cidrs };
}

/** "80,443,8000-8080" or "any" → port ranges; same grammar as the API's parsePortList. */
export function parsePorts(raw: string): PortRange[] | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'any') return [];
  const out: PortRange[] = [];
  for (const part of trimmed.split(/[,\s]+/)) {
    const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > 65535 || from > to) return null;
    out.push({ from, to });
  }
  return out;
}

export function formatPorts(ports: PortRange[]): string {
  return ports.length ? ports.map((p) => (p.from === p.to ? `${p.from}` : `${p.from}-${p.to}`)).join(', ') : 'any';
}

export function formatCidrs(cidrs: string[]): string {
  return cidrs.length === 0 || (cidrs.length === 1 && cidrs[0] === '0.0.0.0/0') ? 'any' : cidrs.join(', ');
}

/**
 * Validates a form and builds the rule, mirroring the API's schema limits (name ≤ 35
 * chars for FortiOS, no ports on ICMP) so most mistakes are caught before a round trip.
 */
export function buildRule(form: FirewallRuleForm, existing: FirewallRule[], id: string): { rule?: FirewallRule; errors: FormErrors } {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Name is required';
  else if (name.length > 35) errors.name = 'Name must be 35 characters or fewer';
  else if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) errors.name = 'A rule with this name already exists';

  const src = parseCidrList(form.sources || 'any');
  if (src.bad) errors.sources = `"${src.bad}" is not a valid IPv4 address or network`;
  const dst = parseCidrList(form.destinations || 'any');
  if (dst.bad) errors.destinations = `"${dst.bad}" is not a valid IPv4 address or network`;

  const ports = parsePorts(form.ports);
  if (ports === null) errors.ports = 'Use ports like 443, 8000-8080 or any';
  else if (form.protocol === 'ICMP' && ports.length) errors.ports = 'ICMP rules cannot specify ports';

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    rule: {
      id,
      name,
      sequence: nextSequence(existing),
      enabled: true,
      action: form.action,
      protocol: form.protocol,
      sourceCidrs: src.cidrs,
      destinationCidrs: dst.cidrs,
      destinationPorts: ports ?? [],
      log: form.log,
    },
  };
}

/**
 * New rules go above a trailing deny-all (otherwise they could never match), leaving a
 * gap of 10 so a rule can later be slotted in between without renumbering.
 */
export function nextSequence(rules: FirewallRule[]): number {
  const sorted = [...rules].sort((a, b) => a.sequence - b.sequence);
  const last = sorted[sorted.length - 1];
  const isDenyAll = (r: FirewallRule) =>
    r.action === 'DENY' && r.protocol === 'ANY' && formatCidrs(r.sourceCidrs) === 'any' && formatCidrs(r.destinationCidrs) === 'any';
  if (last && isDenyAll(last)) {
    const prev = sorted[sorted.length - 2]?.sequence ?? 0;
    const gap = last.sequence - prev;
    return gap > 1 ? prev + Math.min(10, Math.floor(gap / 2)) : last.sequence;
  }
  return (last?.sequence ?? 0) + 10;
}
