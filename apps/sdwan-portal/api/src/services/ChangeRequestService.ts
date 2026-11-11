import { randomUUID } from 'node:crypto';
import {
  ApprovalPolicy,
  approvalPolicyFor,
  APPROVER_ROLES,
  assessRisk,
  canTransition,
  checkCanDecide,
  effectiveApproverRole,
  evaluateApprovals,
  outstandingRequirements,
} from '../domain/approvalRules';
import { hasBlockingFindings, LintFinding, lintFirewallRules } from '../domain/firewallLint';
import { checkScheduleInWindow } from '../domain/maintenanceWindows';
import { validatePolicySet } from '../domain/policyTranslation';
import type {
  ChangeExecutionResult,
  ChangePayload,
  ChangeRequest,
  ChangeStatus,
  ChangeType,
  Page,
  Principal,
} from '../domain/types';
import { BusinessRuleProblem, ConflictProblem, ForbiddenProblem, NotFoundProblem } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ApplyResult } from '../providers/SdwanProvider';
import type { ChangeRequestRepository, MaintenanceWindowRepository } from '../repositories';
import { ConcurrentModificationError, PageRequest } from '../repositories/InMemoryRepository';
import type { CreateChangeRequestInput } from '../validation/schemas';
import type { BackupService } from './BackupService';
import type { InventoryService, ResolvedEdge } from './InventoryService';

export interface ChangeRequestView extends ChangeRequest {
  approvalPolicy: ApprovalPolicy;
  outstanding: string[];
  lintFindings?: LintFinding[];
}

export interface ChangeListFilter extends PageRequest {
  status?: ChangeStatus;
  type?: ChangeType;
}

/** Payload types that rewrite configuration and therefore get a pre-change snapshot. */
const CONFIG_MUTATING: ReadonlySet<ChangeType> = new Set(['POLICY_UPDATE', 'FIREWALL_UPDATE', 'CONFIG_ROLLBACK', 'SOFTWARE_UPGRADE']);

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/**
 * Change request lifecycle: risk-scored creation, submission, multi-party approval,
 * scheduling into maintenance windows and execution against the vendor controllers.
 * Every state change goes through `transition()` so the history is complete and the
 * TRANSITIONS table is the single source of truth for what is allowed.
 */
export class ChangeRequestService {
  constructor(
    private readonly repo: ChangeRequestRepository,
    private readonly windows: MaintenanceWindowRepository,
    private readonly inventory: InventoryService,
    private readonly backups: BackupService,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(accountId: string, filter: ChangeListFilter): Promise<Page<ChangeRequest>> {
    return this.repo.page(
      (c) => c.accountId === accountId && (!filter.status || c.status === filter.status) && (!filter.type || c.type === filter.type),
      filter,
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
  }

  async get(accountId: string, id: string): Promise<ChangeRequestView> {
    return this.view(await this.load(accountId, id));
  }

  async create(principal: Principal, accountId: string, input: CreateChangeRequestInput): Promise<ChangeRequestView> {
    const edges = await this.inventory.resolveEdges(accountId, input.edgeIds);
    const lintFindings = await this.validatePayload(accountId, input.payload, edges);
    const currentItemCount = await this.currentItemCount(input.payload, edges[0]);
    const risk = assessRisk({
      type: input.payload.type,
      payload: input.payload,
      edgeCount: edges.length,
      nonHaEdgeCount: edges.filter((e) => e.edge.haState === 'STANDALONE' || e.edge.haState === 'FAILED').length,
      lintFindings,
      currentItemCount,
    });

    const at = this.now().toISOString();
    const cr: ChangeRequest = {
      id: `CR-${randomUUID()}`,
      accountId,
      title: input.title,
      description: input.description,
      type: input.payload.type,
      edgeIds: input.edgeIds,
      payload: input.payload as ChangePayload,
      risk: risk.level,
      riskReasons: risk.reasons,
      emergency: input.emergency,
      status: 'DRAFT',
      requestedBy: principal.userId,
      requestedByRole: principal.roles[0],
      approvals: [],
      results: [],
      history: [{ at, by: principal.userId, from: null, to: 'DRAFT' }],
      createdAt: at,
      updatedAt: at,
    };
    if (input.submit) this.transition(cr, 'SUBMITTED', principal.userId);
    await this.repo.insert(cr);
    this.logger.info('change request created', { changeRequestId: cr.id, type: cr.type, risk: cr.risk, edges: cr.edgeIds.length });
    return this.view(cr, lintFindings);
  }

  async submit(principal: Principal, accountId: string, id: string): Promise<ChangeRequestView> {
    return this.mutate(accountId, id, (cr) => {
      this.assertOwnerOrApprover(principal, cr);
      this.transition(cr, 'SUBMITTED', principal.userId);
    });
  }

  async cancel(principal: Principal, accountId: string, id: string, reason?: string): Promise<ChangeRequestView> {
    return this.mutate(accountId, id, (cr) => {
      this.assertOwnerOrApprover(principal, cr);
      this.transition(cr, 'CANCELLED', principal.userId, reason);
    });
  }

  async decide(principal: Principal, accountId: string, id: string, decision: { decision: 'APPROVE' | 'REJECT'; comment?: string }): Promise<ChangeRequestView> {
    return this.mutate(accountId, id, (cr) => {
      const check = checkCanDecide(cr, principal);
      if (!check.ok) throw new BusinessRuleProblem('approval', check.reason);
      cr.approvals.push({
        userId: principal.userId,
        role: effectiveApproverRole(principal),
        decision: decision.decision,
        comment: decision.comment,
        decidedAt: this.now().toISOString(),
      });
      const outcome = evaluateApprovals(cr.approvals, approvalPolicyFor(cr.risk, cr.emergency));
      if (outcome !== 'PENDING') this.transition(cr, outcome, principal.userId, decision.comment);
      else cr.updatedAt = this.now().toISOString();
    });
  }

  async schedule(principal: Principal, accountId: string, id: string, input: { maintenanceWindowId?: string; scheduledFor: string }): Promise<ChangeRequestView> {
    const window = input.maintenanceWindowId ? await this.windows.get(input.maintenanceWindowId) : undefined;
    if (input.maintenanceWindowId && (!window || window.accountId !== accountId)) {
      throw new NotFoundProblem('MaintenanceWindow', input.maintenanceWindowId);
    }
    return this.mutate(accountId, id, (cr) => {
      this.assertOwnerOrApprover(principal, cr);
      this.assertTransition(cr, 'SCHEDULED');
      const nowIso = this.now().toISOString();
      const policy = approvalPolicyFor(cr.risk, cr.emergency);
      if (window) {
        const check = checkScheduleInWindow(window, input.scheduledFor, nowIso);
        if (!check.ok) throw new BusinessRuleProblem('maintenance-window', check.reason ?? 'outside maintenance window');
      } else if (policy.requiresMaintenanceWindow) {
        throw new BusinessRuleProblem('maintenance-window', `${cr.risk} risk changes must be scheduled inside a maintenance window`);
      } else if (input.scheduledFor < nowIso) {
        throw new BusinessRuleProblem('schedule', 'scheduled time is in the past');
      }
      cr.maintenanceWindowId = window?.id;
      cr.scheduledFor = new Date(input.scheduledFor).toISOString();
      this.transition(cr, 'SCHEDULED', principal.userId, window ? `window ${window.name}` : undefined);
    });
  }

  /**
   * Picks up work for the executor job: SCHEDULED changes whose time has come, plus
   * approved emergency changes, which skip scheduling by design.
   */
  async executeDue(): Promise<ChangeRequest[]> {
    const nowIso = this.now().toISOString();
    const due = await this.repo.find(
      (c) => (c.status === 'SCHEDULED' && !!c.scheduledFor && c.scheduledFor <= nowIso) || (c.status === 'APPROVED' && c.emergency),
      (a, b) => (a.scheduledFor ?? a.updatedAt).localeCompare(b.scheduledFor ?? b.updatedAt),
    );
    const done: ChangeRequest[] = [];
    for (const cr of due) {
      try {
        done.push(await this.execute(cr));
      } catch (err) {
        if (!(err instanceof ConflictProblem)) throw err;
        this.logger.info('change already picked up by another executor', { changeRequestId: cr.id });
      }
    }
    return done;
  }

  /**
   * Runs a change edge by edge. Each config-mutating step is preceded by a snapshot; if
   * the step fails the snapshot is restored and remaining edges are skipped, limiting the
   * blast radius of a bad change to one site.
   */
  private async execute(claimed: ChangeRequest): Promise<ChangeRequest> {
    const cr = structuredClone(claimed);
    this.transition(cr, 'IN_PROGRESS', 'system');
    let version = await this.save(cr, claimed.updatedAt);

    for (const edgeId of cr.edgeIds) {
      const result = await this.executeOnEdge(cr, edgeId);
      cr.results.push(result);
      cr.updatedAt = this.now().toISOString();
      version = await this.save(cr, version);
      if (!result.ok) break;
    }

    const failed = cr.results.find((r) => !r.ok);
    const skipped = cr.edgeIds.length - cr.results.length;
    this.transition(
      cr,
      failed ? 'FAILED' : 'COMPLETED',
      'system',
      failed ? `failed on ${failed.edgeId}${skipped ? `; ${skipped} edge(s) skipped` : ''}` : undefined,
    );
    await this.save(cr, version);
    this.inventory.invalidate(cr.accountId);
    this.logger.info('change request executed', { changeRequestId: cr.id, status: cr.status, edges: cr.results.length });
    return cr;
  }

  private async executeOnEdge(cr: ChangeRequest, edgeId: string): Promise<ChangeExecutionResult> {
    let backupId: string | undefined;
    try {
      if (CONFIG_MUTATING.has(cr.type)) {
        backupId = (await this.backups.create(cr.accountId, edgeId, 'system', 'PRE_CHANGE', cr.id)).id;
      }
      const applied = await this.apply(cr, edgeId);
      if (applied.warnings.length) this.logger.warn('change applied with warnings', { changeRequestId: cr.id, edgeId, warnings: applied.warnings });
      return { edgeId, ok: true, backupId, finishedAt: this.now().toISOString() };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error('change failed on edge', { changeRequestId: cr.id, edgeId, err });
      let rollbackNote = '';
      if (backupId && cr.type !== 'SOFTWARE_UPGRADE') {
        try {
          await this.backups.restore(cr.accountId, backupId, edgeId);
          rollbackNote = '; pre-change config restored';
        } catch (restoreErr) {
          rollbackNote = `; automatic restore failed: ${(restoreErr as Error).message}`;
        }
      }
      return { edgeId, ok: false, backupId, error: `${message}${rollbackNote}`, finishedAt: this.now().toISOString() };
    }
  }

  private async apply(cr: ChangeRequest, edgeId: string): Promise<ApplyResult> {
    const { edge, provider, ctx } = await this.inventory.resolveEdge(cr.accountId, edgeId);
    const vendorId = edge.vendorRef.id;
    const p = cr.payload;
    switch (p.type) {
      case 'POLICY_UPDATE':
        return provider.applyBusinessPolicies(ctx, vendorId, p.policies);
      case 'FIREWALL_UPDATE':
        return provider.applyFirewallRules(ctx, vendorId, p.rules);
      case 'CONFIG_ROLLBACK':
        return this.backups.restore(cr.accountId, p.backupId, edgeId);
      case 'SOFTWARE_UPGRADE':
        return provider.upgradeEdge(ctx, vendorId, p.targetVersion);
      case 'EDGE_REBOOT':
        return provider.rebootEdge(ctx, vendorId);
    }
  }

  private async validatePayload(accountId: string, payload: CreateChangeRequestInput['payload'], edges: ResolvedEdge[]): Promise<LintFinding[] | undefined> {
    switch (payload.type) {
      case 'FIREWALL_UPDATE': {
        const findings = lintFirewallRules(payload.rules);
        if (hasBlockingFindings(findings)) {
          throw new BusinessRuleProblem('firewall-lint', 'The rule set has blocking lint errors', {
            findings: findings.filter((f) => f.severity === 'ERROR'),
          });
        }
        return findings;
      }
      case 'POLICY_UPDATE': {
        const errors = validatePolicySet(payload.policies).filter((i) => i.severity === 'ERROR');
        if (errors.length) throw new BusinessRuleProblem('policy-invalid', 'The policy set is invalid', { issues: errors });
        return undefined;
      }
      case 'CONFIG_ROLLBACK': {
        const backup = await this.backups.get(accountId, payload.backupId);
        if (backup.edgeId !== edges[0].edge.id) {
          throw new BusinessRuleProblem('backup-edge-mismatch', `Backup ${backup.id} was taken from edge ${backup.edgeId}`);
        }
        return undefined;
      }
      case 'SOFTWARE_UPGRADE': {
        const notNewer = edges.filter((e) => compareVersions(payload.targetVersion, e.edge.softwareVersion) <= 0);
        if (notNewer.length) {
          throw new BusinessRuleProblem('upgrade-version', `Target ${payload.targetVersion} is not newer than the running version`, {
            edges: notNewer.map((e) => ({ edgeId: e.edge.id, running: e.edge.softwareVersion })),
          });
        }
        return undefined;
      }
      case 'EDGE_REBOOT':
        return undefined;
    }
  }

  private async currentItemCount(payload: CreateChangeRequestInput['payload'], first: ResolvedEdge): Promise<number | undefined> {
    const vendorId = first.edge.vendorRef.id;
    if (payload.type === 'POLICY_UPDATE') return (await first.provider.listBusinessPolicies(first.ctx, vendorId)).length;
    if (payload.type === 'FIREWALL_UPDATE') return (await first.provider.listFirewallRules(first.ctx, vendorId)).length;
    return undefined;
  }

  private assertOwnerOrApprover(principal: Principal, cr: ChangeRequest): void {
    if (cr.requestedBy !== principal.userId && !principal.roles.some((r) => APPROVER_ROLES.includes(r))) {
      throw new ForbiddenProblem('Only the requester or an approver may modify this change request');
    }
  }

  private assertTransition(cr: ChangeRequest, to: ChangeStatus): void {
    if (!canTransition(cr.status, to)) {
      throw new ConflictProblem(`Change request is ${cr.status} and cannot move to ${to}`, { status: cr.status, requested: to });
    }
  }

  private transition(cr: ChangeRequest, to: ChangeStatus, by: string, note?: string): void {
    this.assertTransition(cr, to);
    const at = this.now().toISOString();
    cr.history.push({ at, by, from: cr.status, to, note });
    cr.status = to;
    cr.updatedAt = at;
  }

  private async load(accountId: string, id: string): Promise<ChangeRequest> {
    const cr = await this.repo.get(id);
    if (!cr || cr.accountId !== accountId) throw new NotFoundProblem('ChangeRequest', id);
    return cr;
  }

  /** Persists with optimistic concurrency and returns the new version stamp. */
  private async save(cr: ChangeRequest, expectedUpdatedAt: string): Promise<string> {
    try {
      await this.repo.update(cr, expectedUpdatedAt);
      return cr.updatedAt;
    } catch (err) {
      if (err instanceof ConcurrentModificationError) {
        throw new ConflictProblem('The change request was modified concurrently; reload and retry');
      }
      throw err;
    }
  }

  private async mutate(accountId: string, id: string, fn: (cr: ChangeRequest) => void): Promise<ChangeRequestView> {
    const cr = await this.load(accountId, id);
    const version = cr.updatedAt;
    fn(cr);
    await this.save(cr, version);
    return this.view(cr);
  }

  private view(cr: ChangeRequest, lintFindings?: LintFinding[]): ChangeRequestView {
    const approvalPolicy = approvalPolicyFor(cr.risk, cr.emergency);
    return {
      ...cr,
      approvalPolicy,
      outstanding: cr.status === 'SUBMITTED' ? outstandingRequirements(cr.approvals, approvalPolicy) : [],
      lintFindings: lintFindings ?? (cr.payload.type === 'FIREWALL_UPDATE' ? lintFirewallRules(cr.payload.rules) : undefined),
    };
  }
}
