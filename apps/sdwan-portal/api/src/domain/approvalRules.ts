import type { Approval, ChangePayload, ChangeRequest, ChangeStatus, ChangeType, Principal, RiskLevel, Role } from './types';
import type { LintFinding } from './firewallLint';

/** Allowed status transitions. Anything not listed is rejected by the service. */
export const TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT'],
  APPROVED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['DRAFT'],
  CANCELLED: [],
};

export function canTransition(from: ChangeStatus, to: ChangeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const BASE_RISK: Record<ChangeType, number> = {
  POLICY_UPDATE: 2,
  FIREWALL_UPDATE: 3,
  CONFIG_ROLLBACK: 4,
  SOFTWARE_UPGRADE: 5,
  EDGE_REBOOT: 4,
};

export interface RiskInput {
  type: ChangeType;
  payload: ChangePayload;
  edgeCount: number;
  /** Edges without an HA peer — a failed change there is a full site outage. */
  nonHaEdgeCount: number;
  lintFindings?: LintFinding[];
  /** Number of existing rules/policies being replaced, for churn estimation. */
  currentItemCount?: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  points: number;
  reasons: string[];
}

/**
 * Points-based risk model. Each factor adds points and a human-readable reason that
 * is stored on the change request and shown to approvers.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
  const reasons: string[] = [];
  let points = BASE_RISK[input.type];
  reasons.push(`${input.type} base risk ${points}`);

  if (input.edgeCount > 1) {
    const blast = input.edgeCount >= 10 ? 4 : input.edgeCount >= 3 ? 2 : 1;
    points += blast;
    reasons.push(`affects ${input.edgeCount} edges (+${blast})`);
  }
  if (input.nonHaEdgeCount > 0 && input.type !== 'POLICY_UPDATE') {
    points += 2;
    reasons.push(`${input.nonHaEdgeCount} edge(s) have no HA peer (+2)`);
  }

  const warnings = (input.lintFindings ?? []).filter((f) => f.severity === 'WARNING');
  if (warnings.some((w) => w.code === 'ANY_ANY_ALLOW')) {
    points += 3;
    reasons.push('rule set contains an any-any ALLOW (+3)');
  }
  const others = warnings.filter((w) => w.code !== 'ANY_ANY_ALLOW').length;
  if (others > 0) {
    points += Math.min(2, others);
    reasons.push(`${others} lint warning(s) (+${Math.min(2, others)})`);
  }

  const newCount =
    input.payload.type === 'POLICY_UPDATE'
      ? input.payload.policies.length
      : input.payload.type === 'FIREWALL_UPDATE'
        ? input.payload.rules.length
        : undefined;
  if (newCount !== undefined && input.currentItemCount !== undefined && input.currentItemCount > 0) {
    const churn = Math.abs(newCount - input.currentItemCount) / input.currentItemCount;
    if (churn >= 0.5) {
      points += 2;
      reasons.push(`large change in item count ${input.currentItemCount} -> ${newCount} (+2)`);
    }
  }
  if (input.payload.type === 'FIREWALL_UPDATE' && input.payload.rules.length === 0) {
    points += 4;
    reasons.push('removes all firewall rules (+4)');
  }

  const level: RiskLevel = points >= 10 ? 'CRITICAL' : points >= 7 ? 'HIGH' : points >= 4 ? 'MEDIUM' : 'LOW';
  return { level, points, reasons };
}

export interface ApprovalPolicy {
  requiredApprovals: number;
  /** At least one approval must come from each of these roles. */
  requiredRoles: Role[];
  requiresMaintenanceWindow: boolean;
}

export function approvalPolicyFor(risk: RiskLevel, emergency: boolean): ApprovalPolicy {
  switch (risk) {
    case 'LOW':
      return { requiredApprovals: 1, requiredRoles: [], requiresMaintenanceWindow: false };
    case 'MEDIUM':
      return { requiredApprovals: 1, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: !emergency };
    case 'HIGH':
      return { requiredApprovals: 2, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: !emergency };
    case 'CRITICAL':
      return {
        requiredApprovals: 2,
        requiredRoles: ['BUSINESS_ADMIN', 'SUPPORT_AGENT'],
        requiresMaintenanceWindow: !emergency,
      };
  }
}

export const APPROVER_ROLES: Role[] = ['BUSINESS_ADMIN', 'SUPPORT_AGENT'];

export type ApprovalCheck = { ok: true } | { ok: false; reason: string };

/** Validates that `approver` may record a decision on `cr` (does not mutate). */
export function checkCanDecide(cr: ChangeRequest, approver: Principal): ApprovalCheck {
  if (cr.status !== 'SUBMITTED') return { ok: false, reason: `change request is ${cr.status}, not SUBMITTED` };
  if (approver.userId === cr.requestedBy) return { ok: false, reason: 'requesters cannot approve their own change' };
  if (!approver.roles.some((r) => APPROVER_ROLES.includes(r))) {
    return { ok: false, reason: 'approver must hold BUSINESS_ADMIN or SUPPORT_AGENT' };
  }
  if (cr.approvals.some((a) => a.userId === approver.userId)) {
    return { ok: false, reason: 'you have already recorded a decision on this change' };
  }
  if (cr.emergency && !approver.roles.includes('SUPPORT_AGENT') && cr.risk !== 'LOW') {
    // Emergency changes skip the maintenance window, so Uniti NOC must be in the loop.
    const hasSupport = cr.approvals.some((a) => a.role === 'SUPPORT_AGENT' && a.decision === 'APPROVE');
    if (!hasSupport && cr.approvals.length + 1 >= approvalPolicyFor(cr.risk, true).requiredApprovals) {
      return { ok: false, reason: 'emergency changes require a SUPPORT_AGENT approval' };
    }
  }
  return { ok: true };
}

/** The role an approval is recorded under: the most privileged approver role the principal holds. */
export function effectiveApproverRole(principal: Principal): Role {
  if (principal.roles.includes('SUPPORT_AGENT')) return 'SUPPORT_AGENT';
  return 'BUSINESS_ADMIN';
}

export type ApprovalOutcome = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Any single rejection rejects the change. Otherwise it is approved once the approval
 * count and role coverage of the policy are met.
 */
export function evaluateApprovals(approvals: Approval[], policy: ApprovalPolicy): ApprovalOutcome {
  if (approvals.some((a) => a.decision === 'REJECT')) return 'REJECTED';
  const approves = approvals.filter((a) => a.decision === 'APPROVE');
  if (approves.length < policy.requiredApprovals) return 'PENDING';
  const covered = policy.requiredRoles.every((role) => approves.some((a) => a.role === role));
  return covered ? 'APPROVED' : 'PENDING';
}

/** Describes what is still missing — rendered in the UI next to the approve button. */
export function outstandingRequirements(approvals: Approval[], policy: ApprovalPolicy): string[] {
  const approves = approvals.filter((a) => a.decision === 'APPROVE');
  const missing: string[] = [];
  const remaining = policy.requiredApprovals - approves.length;
  if (remaining > 0) missing.push(`${remaining} more approval(s)`);
  for (const role of policy.requiredRoles) {
    if (!approves.some((a) => a.role === role)) missing.push(`an approval from ${role}`);
  }
  return missing;
}
