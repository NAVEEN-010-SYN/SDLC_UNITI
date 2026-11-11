import type { ApprovalPolicy } from '../domain/approvalRules';
import { hasBlockingFindings, LintFinding, lintFirewallRules } from '../domain/firewallLint';
import { checkScheduleInWindow } from '../domain/maintenanceWindows';
import { validatePolicySet } from '../domain/policyTranslation';
import type { BusinessPolicy, FirewallRule, MaintenanceWindow, RiskLevel } from '../domain/types';
import { BusinessRuleProblem } from '../errors/problem';
import type { CreateChangeRequestInput } from '../validation/schemas';
import type { BackupService } from './BackupService';
import type { ResolvedEdge } from './InventoryService';

type Payload = CreateChangeRequestInput['payload'];

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

function validateFirewall(rules: FirewallRule[]): LintFinding[] {
  const findings = lintFirewallRules(rules);
  if (hasBlockingFindings(findings)) {
    throw new BusinessRuleProblem('firewall-lint', 'The rule set has blocking lint errors', {
      findings: findings.filter((f) => f.severity === 'ERROR'),
    });
  }
  return findings;
}

function validatePolicies(policies: BusinessPolicy[]): void {
  const errors = validatePolicySet(policies).filter((i) => i.severity === 'ERROR');
  if (errors.length) throw new BusinessRuleProblem('policy-invalid', 'The policy set is invalid', { issues: errors });
}

function validateUpgrade(targetVersion: string, edges: ResolvedEdge[]): void {
  const notNewer = edges.filter((e) => compareVersions(targetVersion, e.edge.softwareVersion) <= 0);
  if (notNewer.length === 0) return;
  throw new BusinessRuleProblem('upgrade-version', `Target ${targetVersion} is not newer than the running version`, {
    edges: notNewer.map((e) => ({ edgeId: e.edge.id, running: e.edge.softwareVersion })),
  });
}

/** Validates a change payload against the target edges; returns lint findings for firewall changes. */
export async function validateChangePayload(
  backups: BackupService,
  accountId: string,
  payload: Payload,
  edges: ResolvedEdge[],
): Promise<LintFinding[] | undefined> {
  if (payload.type === 'FIREWALL_UPDATE') return validateFirewall(payload.rules);
  if (payload.type === 'POLICY_UPDATE') {
    validatePolicies(payload.policies);
    return undefined;
  }
  if (payload.type === 'CONFIG_ROLLBACK') {
    const backup = await backups.get(accountId, payload.backupId);
    if (backup.edgeId !== edges[0].edge.id) {
      throw new BusinessRuleProblem('backup-edge-mismatch', `Backup ${backup.id} was taken from edge ${backup.edgeId}`);
    }
    return undefined;
  }
  if (payload.type === 'SOFTWARE_UPGRADE') validateUpgrade(payload.targetVersion, edges);
  return undefined;
}

/** Throws when the requested schedule breaks the window or timing rules for this risk level. */
export function assertScheduleAllowed(
  window: MaintenanceWindow | undefined,
  policy: ApprovalPolicy,
  risk: RiskLevel,
  scheduledFor: string,
  nowIso: string,
): void {
  if (window) {
    const check = checkScheduleInWindow(window, scheduledFor, nowIso);
    if (!check.ok) throw new BusinessRuleProblem('maintenance-window', check.reason ?? 'outside maintenance window');
    return;
  }
  if (policy.requiresMaintenanceWindow) {
    throw new BusinessRuleProblem('maintenance-window', `${risk} risk changes must be scheduled inside a maintenance window`);
  }
  if (scheduledFor < nowIso) {
    throw new BusinessRuleProblem('schedule', 'scheduled time is in the past');
  }
}
