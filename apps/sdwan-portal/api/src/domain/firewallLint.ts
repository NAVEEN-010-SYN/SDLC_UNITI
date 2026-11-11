import type { FirewallRule } from './types';
import { cidrSetCovers, cidrSetsOverlap, parseCidr, portSetCovers, portSetsOverlap } from './cidr';

export type LintSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface LintFinding {
  ruleId: string;
  severity: LintSeverity;
  code: 'SHADOWED' | 'CONFLICT' | 'DUPLICATE_SEQUENCE' | 'ANY_ANY_ALLOW' | 'INVALID_CIDR' | 'MISSING_DEFAULT_DENY' | 'DISABLED';
  message: string;
  relatedRuleId?: string;
}

function protocolCovers(outer: FirewallRule['protocol'], inner: FirewallRule['protocol']): boolean {
  return outer === 'ANY' || outer === inner;
}

function protocolsOverlap(a: FirewallRule['protocol'], b: FirewallRule['protocol']): boolean {
  return a === 'ANY' || b === 'ANY' || a === b;
}

/** True when every packet matching `inner` would already be matched by `outer`. */
export function ruleCovers(outer: FirewallRule, inner: FirewallRule): boolean {
  return (
    protocolCovers(outer.protocol, inner.protocol) &&
    cidrSetCovers(outer.sourceCidrs, inner.sourceCidrs) &&
    cidrSetCovers(outer.destinationCidrs, inner.destinationCidrs) &&
    (inner.protocol === 'ICMP' || outer.protocol === 'ICMP' || portSetCovers(outer.destinationPorts, inner.destinationPorts))
  );
}

export function rulesOverlap(a: FirewallRule, b: FirewallRule): boolean {
  return (
    protocolsOverlap(a.protocol, b.protocol) &&
    cidrSetsOverlap(a.sourceCidrs, b.sourceCidrs) &&
    cidrSetsOverlap(a.destinationCidrs, b.destinationCidrs) &&
    portSetsOverlap(a.destinationPorts, b.destinationPorts)
  );
}

function isAnyAny(rule: FirewallRule): boolean {
  return (
    rule.protocol === 'ANY' &&
    cidrSetCovers(rule.sourceCidrs, ['0.0.0.0/0']) &&
    cidrSetCovers(rule.destinationCidrs, ['0.0.0.0/0']) &&
    rule.destinationPorts.length === 0
  );
}

/**
 * Static analysis of an ordered rule set, run before a FIREWALL_UPDATE change request is
 * submitted. ERROR findings block submission; WARNINGs are shown to the approver and
 * raise the change's risk score.
 */
export function lintFirewallRules(rules: FirewallRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const ordered = [...rules].sort((a, b) => a.sequence - b.sequence);

  const seenSeq = new Map<number, string>();
  for (const r of ordered) {
    const prior = seenSeq.get(r.sequence);
    if (prior) {
      findings.push({
        ruleId: r.id,
        severity: 'ERROR',
        code: 'DUPLICATE_SEQUENCE',
        message: `Rule "${r.name}" reuses sequence ${r.sequence}`,
        relatedRuleId: prior,
      });
    } else {
      seenSeq.set(r.sequence, r.id);
    }
  }

  const valid: FirewallRule[] = [];
  for (const r of ordered) {
    const bad = [...r.sourceCidrs, ...r.destinationCidrs].find((c) => {
      try {
        parseCidr(c);
        return false;
      } catch {
        return true;
      }
    });
    if (bad) {
      findings.push({ ruleId: r.id, severity: 'ERROR', code: 'INVALID_CIDR', message: `Rule "${r.name}" has invalid address "${bad}"` });
    } else {
      valid.push(r);
    }
  }

  const enabled = valid.filter((r) => r.enabled);
  for (const r of valid.filter((x) => !x.enabled)) {
    findings.push({ ruleId: r.id, severity: 'INFO', code: 'DISABLED', message: `Rule "${r.name}" is disabled and has no effect` });
  }

  for (let i = 0; i < enabled.length; i++) {
    const rule = enabled[i];
    if (rule.action === 'ALLOW' && isAnyAny(rule)) {
      findings.push({
        ruleId: rule.id,
        severity: 'WARNING',
        code: 'ANY_ANY_ALLOW',
        message: `Rule "${rule.name}" allows all traffic from any source to any destination`,
      });
    }
    for (let j = 0; j < i; j++) {
      const earlier = enabled[j];
      if (ruleCovers(earlier, rule)) {
        findings.push({
          ruleId: rule.id,
          severity: earlier.action === rule.action ? 'WARNING' : 'ERROR',
          code: 'SHADOWED',
          message:
            earlier.action === rule.action
              ? `Rule "${rule.name}" is redundant: "${earlier.name}" already matches all of its traffic`
              : `Rule "${rule.name}" never matches: "${earlier.name}" (${earlier.action}) matches all of its traffic first`,
          relatedRuleId: earlier.id,
        });
        break;
      }
      if (earlier.action !== rule.action && rulesOverlap(earlier, rule)) {
        findings.push({
          ruleId: rule.id,
          severity: 'WARNING',
          code: 'CONFLICT',
          message: `Rule "${rule.name}" (${rule.action}) partially overlaps "${earlier.name}" (${earlier.action}); the earlier rule wins for the overlap`,
          relatedRuleId: earlier.id,
        });
      }
    }
  }

  const last = enabled[enabled.length - 1];
  if (enabled.length > 0 && !(last.action === 'DENY' && isAnyAny(last))) {
    findings.push({
      ruleId: last.id,
      severity: 'INFO',
      code: 'MISSING_DEFAULT_DENY',
      message: 'Rule set does not end with an explicit deny-all; the vendor implicit default will apply',
    });
  }

  return findings;
}

export function hasBlockingFindings(findings: LintFinding[]): boolean {
  return findings.some((f) => f.severity === 'ERROR');
}
