import { hasBlockingFindings, LintFinding, lintFirewallRules } from '../domain/firewallLint';
import { PolicyIssue, TranslationWarning, translationWarnings, validatePolicySet } from '../domain/policyTranslation';
import type { BusinessPolicy, FirewallRule, Vendor } from '../domain/types';
import type { InventoryService } from './InventoryService';

export interface PolicyView {
  edgeId: string;
  vendor: Vendor;
  policies: BusinessPolicy[];
  issues: PolicyIssue[];
  warnings: TranslationWarning[];
}

export interface FirewallView {
  edgeId: string;
  vendor: Vendor;
  rules: FirewallRule[];
  findings: LintFinding[];
}

export interface PolicyPreview {
  valid: boolean;
  issues: PolicyIssue[];
  /** Per-vendor translation caveats for the edges the policy set would be applied to. */
  warnings: Array<TranslationWarning & { vendor: Vendor }>;
}

export interface FirewallPreview {
  valid: boolean;
  findings: LintFinding[];
}

/**
 * Read side of business policies and firewall rules, plus dry-run validation the UI calls
 * while a user is editing — the same checks a change request runs at creation time, so a
 * draft that previews clean will not be rejected on submit.
 */
export class EdgeConfigService {
  constructor(private readonly inventory: InventoryService) {}

  async policies(accountId: string, edgeId: string): Promise<PolicyView> {
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    const policies = (await provider.listBusinessPolicies(ctx, edge.vendorRef.id)).sort((a, b) => a.order - b.order);
    return {
      edgeId,
      vendor: edge.vendor,
      policies,
      issues: validatePolicySet(policies),
      warnings: translationWarnings(policies, edge.vendor),
    };
  }

  async firewall(accountId: string, edgeId: string): Promise<FirewallView> {
    const { edge, provider, ctx } = await this.inventory.resolveEdge(accountId, edgeId);
    const rules = (await provider.listFirewallRules(ctx, edge.vendorRef.id)).sort((a, b) => a.sequence - b.sequence);
    return { edgeId, vendor: edge.vendor, rules, findings: lintFirewallRules(rules) };
  }

  async previewPolicies(accountId: string, edgeIds: string[], policies: BusinessPolicy[]): Promise<PolicyPreview> {
    const resolved = await this.inventory.resolveEdges(accountId, edgeIds);
    const vendors = [...new Set(resolved.map((r) => r.edge.vendor))];
    const issues = validatePolicySet(policies);
    return {
      valid: !issues.some((i) => i.severity === 'ERROR'),
      issues,
      warnings: vendors.flatMap((vendor) => translationWarnings(policies, vendor).map((w) => ({ ...w, vendor }))),
    };
  }

  previewFirewall(rules: FirewallRule[]): FirewallPreview {
    const findings = lintFirewallRules(rules);
    return { valid: !hasBlockingFindings(findings), findings };
  }
}
