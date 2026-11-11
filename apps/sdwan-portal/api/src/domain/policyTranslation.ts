import type { BusinessPolicy, PolicyPriority, ServiceClass, Vendor } from './types';
import { DEFAULT_SLA } from './linkScoring';
import { cidrSetCovers, parseCidr, portSetCovers } from './cidr';

/**
 * What each vendor can express natively. Used to warn a customer before they submit a
 * neutral policy that cannot be represented faithfully on their edges.
 */
export interface VendorPolicyCapabilities {
  maxPolicies: number;
  supportsRateLimit: boolean;
  supportsDscpRemark: boolean;
  supportsPerPolicySla: boolean;
  supportsMandatoryTransport: boolean;
  supportsApplicationMatch: boolean;
}

export const POLICY_CAPABILITIES: Record<Vendor, VendorPolicyCapabilities> = {
  VELOCLOUD: {
    maxPolicies: 256,
    supportsRateLimit: true,
    supportsDscpRemark: true,
    // VCO applies SLA via service class thresholds at the link-steering level, not per rule.
    supportsPerPolicySla: false,
    supportsMandatoryTransport: true,
    supportsApplicationMatch: true,
  },
  FORTINET: {
    maxPolicies: 4000,
    // FortiOS SD-WAN rules steer only; shaping is a separate traffic-shaper object.
    supportsRateLimit: false,
    supportsDscpRemark: true,
    supportsPerPolicySla: true,
    supportsMandatoryTransport: true,
    supportsApplicationMatch: true,
  },
};

export interface TranslationWarning {
  policyId: string;
  field: string;
  message: string;
}

/** Fields of `policies` that will be dropped or approximated on `vendor`. */
export function translationWarnings(policies: BusinessPolicy[], vendor: Vendor): TranslationWarning[] {
  const caps = POLICY_CAPABILITIES[vendor];
  const warnings: TranslationWarning[] = [];
  if (policies.length > caps.maxPolicies) {
    warnings.push({ policyId: '*', field: 'count', message: `${vendor} supports at most ${caps.maxPolicies} policies` });
  }
  for (const p of policies) {
    if (p.action.rateLimitKbps !== undefined && !caps.supportsRateLimit) {
      warnings.push({ policyId: p.id, field: 'action.rateLimitKbps', message: `rate limit is not applied by ${vendor} SD-WAN rules` });
    }
    if (p.action.dscpRemark !== undefined && !caps.supportsDscpRemark) {
      warnings.push({ policyId: p.id, field: 'action.dscpRemark', message: `DSCP remark is not supported on ${vendor}` });
    }
    if (p.action.sla && !caps.supportsPerPolicySla) {
      warnings.push({
        policyId: p.id,
        field: 'action.sla',
        message: `${vendor} enforces SLA per service class; custom thresholds are approximated by the ${p.action.serviceClass} class`,
      });
    }
    if (p.action.steering === 'MANDATORY_TRANSPORT' && !caps.supportsMandatoryTransport) {
      warnings.push({ policyId: p.id, field: 'action.steering', message: `mandatory transport is not supported on ${vendor}` });
    }
    if ((p.action.steering === 'PREFERRED_TRANSPORT' || p.action.steering === 'MANDATORY_TRANSPORT') && !p.action.preferredTransport) {
      warnings.push({ policyId: p.id, field: 'action.preferredTransport', message: 'transport steering requires a preferredTransport' });
    }
  }
  return warnings;
}

/** Fills defaults so two policies that differ only by implicit values compare equal. */
export function normalizePolicy(p: BusinessPolicy): BusinessPolicy {
  const sorted = (xs?: string[]) => (xs && xs.length ? [...new Set(xs.map((x) => x.trim()))].sort() : undefined);
  return {
    ...p,
    name: p.name.trim(),
    match: {
      applications: sorted(p.match.applications?.map((a) => a.toLowerCase())),
      sourceCidrs: sorted(p.match.sourceCidrs),
      destinationCidrs: sorted(p.match.destinationCidrs),
      protocol: p.match.protocol ?? 'ANY',
      destinationPorts: p.match.destinationPorts?.length
        ? [...p.match.destinationPorts].sort((a, b) => a.from - b.from)
        : undefined,
      dscp: p.match.dscp,
    },
    action: {
      ...p.action,
      sla: p.action.sla ?? DEFAULT_SLA[p.action.serviceClass],
    },
  };
}

/** Policies are evaluated by ascending order; re-numbers to 10, 20, 30... preserving relative order. */
export function renumberPolicies(policies: BusinessPolicy[]): BusinessPolicy[] {
  return [...policies]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((p, i) => ({ ...p, order: (i + 1) * 10 }));
}

function matchCovers(outer: BusinessPolicy['match'], inner: BusinessPolicy['match']): boolean {
  if (outer.applications?.length) {
    if (!inner.applications?.length) return false;
    if (!inner.applications.every((a) => outer.applications!.includes(a))) return false;
  }
  if (outer.protocol && outer.protocol !== 'ANY' && outer.protocol !== inner.protocol) return false;
  if (outer.dscp !== undefined && outer.dscp !== inner.dscp) return false;
  if (!cidrSetCovers(outer.sourceCidrs ?? [], inner.sourceCidrs ?? [])) return false;
  if (!cidrSetCovers(outer.destinationCidrs ?? [], inner.destinationCidrs ?? [])) return false;
  return portSetCovers(outer.destinationPorts ?? [], inner.destinationPorts ?? []);
}

export interface PolicyIssue {
  policyId: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

/** Validates a neutral policy set: names unique, CIDRs valid, no fully shadowed policies. */
export function validatePolicySet(policies: BusinessPolicy[]): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const names = new Map<string, string>();
  for (const p of policies) {
    const key = p.name.trim().toLowerCase();
    if (names.has(key)) issues.push({ policyId: p.id, severity: 'ERROR', message: `duplicate policy name "${p.name}"` });
    else names.set(key, p.id);
    for (const c of [...(p.match.sourceCidrs ?? []), ...(p.match.destinationCidrs ?? [])]) {
      try {
        parseCidr(c);
      } catch (e) {
        issues.push({ policyId: p.id, severity: 'ERROR', message: (e as Error).message });
      }
    }
    if (p.action.sla) {
      const s = p.action.sla;
      if (s.maxLatencyMs <= 0 || s.maxJitterMs < 0 || s.maxLossPct < 0 || s.maxLossPct > 100) {
        issues.push({ policyId: p.id, severity: 'ERROR', message: 'SLA thresholds out of range' });
      }
    }
  }
  if (issues.some((i) => i.severity === 'ERROR')) return issues;

  const ordered = policies.filter((p) => p.enabled).sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = 0; j < i; j++) {
      if (matchCovers(ordered[j].match, ordered[i].match)) {
        issues.push({
          policyId: ordered[i].id,
          severity: 'WARNING',
          message: `"${ordered[i].name}" is never reached: "${ordered[j].name}" matches all of its traffic first`,
        });
        break;
      }
    }
  }
  return issues;
}

/** DSCP code points conventionally associated with each service class (RFC 4594). */
export const SERVICE_CLASS_DSCP: Record<ServiceClass, number> = { REALTIME: 46, TRANSACTIONAL: 26, BULK: 10 };

/** Inverse mapping used when a vendor gives us only a DSCP marking. */
export function serviceClassFromDscp(dscp: number | undefined): ServiceClass | undefined {
  if (dscp === undefined) return undefined;
  if (dscp === 46 || dscp === 34 || (dscp >= 40 && dscp <= 47)) return 'REALTIME';
  if (dscp >= 16 && dscp <= 39) return 'TRANSACTIONAL';
  return 'BULK';
}

export function defaultPriorityFor(cls: ServiceClass): PolicyPriority {
  if (cls === 'REALTIME') return 'HIGH';
  if (cls === 'TRANSACTIONAL') return 'NORMAL';
  return 'LOW';
}
