# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal (part 5 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 22

## Files

- `apps/sdwan-portal/api/src/services/ChangeRequestService.ts` (379 lines)
- `apps/sdwan-portal/api/src/services/EdgeConfigService.ts` (75 lines)
- `apps/sdwan-portal/api/src/services/HealthService.ts` (123 lines)
- `apps/sdwan-portal/api/src/services/InventoryService.ts` (149 lines)
- `apps/sdwan-portal/api/src/services/MaintenanceWindowService.ts` (79 lines)
- `apps/sdwan-portal/api/src/services/ReportService.test.ts` (43 lines)
- `apps/sdwan-portal/api/src/services/ReportService.ts` (121 lines)
- `apps/sdwan-portal/api/src/testing/fakeFetch.ts` (46 lines)
- `apps/sdwan-portal/api/src/testing/harness.ts` (51 lines)
- `apps/sdwan-portal/api/src/validation/schemas.test.ts` (51 lines)
- `apps/sdwan-portal/api/src/validation/schemas.ts` (180 lines)
- `apps/sdwan-portal/api/src/validation/validate.ts` (10 lines)
- `apps/sdwan-portal/api/tsconfig.build.json` (8 lines)
- `apps/sdwan-portal/api/tsconfig.json` (20 lines)
- `apps/sdwan-portal/web/.env.example` (6 lines)
- `apps/sdwan-portal/web/index.html` (13 lines)
- `apps/sdwan-portal/web/package.json` (32 lines)
- `apps/sdwan-portal/web/src/App.tsx` (47 lines)
- `apps/sdwan-portal/web/src/api/client.test.ts` (56 lines)
- `apps/sdwan-portal/web/src/api/client.ts` (112 lines)
- `apps/sdwan-portal/web/src/api/sdwan.ts` (76 lines)
- `apps/sdwan-portal/web/src/api/types.ts` (250 lines)

## apps/sdwan-portal/api/src/services/ChangeRequestService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/ChangeRequestService.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/services/EdgeConfigService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/EdgeConfigService.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/services/HealthService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/HealthService.ts`.

```typescript
import type { Edge, LinkSample, SlaThresholds, WanLink } from '../domain/types';
import { aggregateLink, bucketize, LinkAggregate, pickBucketSeconds, TimeBucket, utilisationP95 } from '../domain/metricsAggregation';
import { DEFAULT_SLA, edgeHealthScore, LinkScore, scoreLink } from '../domain/linkScoring';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { Logger } from '../logging/logger';
import type { InventoryService } from './InventoryService';

export interface LinkHealth {
  link: WanLink;
  aggregate: LinkAggregate | null;
  score: LinkScore | null;
  utilisation: { rxP95Pct: number; txP95Pct: number };
  series: TimeBucket[];
}

export interface EdgeHealth {
  edge: Pick<Edge, 'id' | 'name' | 'status' | 'vendor' | 'haState' | 'siteId'>;
  range: { from: string; to: string };
  bucketSeconds: number;
  healthScore: number;
  links: LinkHealth[];
  dataSource: 'store' | 'controller';
}

export interface AccountHealthOverview {
  range: { from: string; to: string };
  averageScore: number;
  edges: Array<{ edgeId: string; name: string; status: Edge['status']; healthScore: number; worstLink?: { linkId: string; grade: string; mos: number } }>;
  worstLinks: Array<{ edgeId: string; linkId: string; name: string; score: number; slaCompliancePct: number }>;
}

/**
 * Serves link quality from the poller-filled metrics store, falling back to a live
 * controller query when the store has no data for the edge yet (first view after
 * onboarding, or a range older than retention that VCO can still serve).
 */
export class HealthService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly store: MetricsStore,
    private readonly logger: Logger,
  ) {}

  private async samplesFor(accountId: string, edgeId: string, from: string, to: string): Promise<{ samples: LinkSample[]; source: EdgeHealth['dataSource'] }> {
    const stored = this.store.queryEdge(edgeId, from, to);
    if (stored.length > 0) return { samples: stored, source: 'store' };
    const { provider, ctx, edge } = await this.inventory.resolveEdge(accountId, edgeId);
    try {
      const live = await provider.getLinkMetrics(ctx, edge.vendorRef.id, { from, to });
      this.store.append(live);
      return { samples: live, source: 'controller' };
    } catch (err) {
      this.logger.warn('live metrics fetch failed', { edgeId, err });
      return { samples: [], source: 'controller' };
    }
  }

  async edgeHealth(accountId: string, edgeId: string, range: { from: string; to: string }, sla: SlaThresholds = DEFAULT_SLA.REALTIME): Promise<EdgeHealth> {
    const { edge } = await this.inventory.resolveEdge(accountId, edgeId);
    const { samples, source } = await this.samplesFor(accountId, edgeId, range.from, range.to);
    const bucketSeconds = pickBucketSeconds(range.from, range.to);
    const byLink = new Map<string, LinkSample[]>();
    for (const s of samples) {
      const list = byLink.get(s.linkId);
      if (list) list.push(s);
      else byLink.set(s.linkId, [s]);
    }
    const links: LinkHealth[] = edge.links.map((link) => {
      const ls = byLink.get(link.id) ?? [];
      return {
        link,
        aggregate: aggregateLink(ls),
        score: scoreLink(ls, sla),
        utilisation: {
          rxP95Pct: utilisationP95(ls, link.bandwidthDownKbps, 'rx'),
          txP95Pct: utilisationP95(ls, link.bandwidthUpKbps, 'tx'),
        },
        series: bucketize(ls, bucketSeconds),
      };
    });
    const scores = links.map((l) => l.score?.score).filter((s): s is number => s !== undefined);
    return {
      edge: { id: edge.id, name: edge.name, status: edge.status, vendor: edge.vendor, haState: edge.haState, siteId: edge.siteId },
      range,
      bucketSeconds,
      healthScore: edge.status === 'DOWN' ? 0 : edgeHealthScore(scores),
      links,
      dataSource: source,
    };
  }

  async overview(accountId: string, range: { from: string; to: string }): Promise<AccountHealthOverview> {
    const edges = await this.inventory.listEdges(accountId);
    const rows: AccountHealthOverview['edges'] = [];
    const linkRows: AccountHealthOverview['worstLinks'] = [];

    for (const edge of edges) {
      const samples = this.store.queryEdge(edge.id, range.from, range.to);
      const linkScores = edge.links
        .map((l) => ({ link: l, score: scoreLink(samples.filter((s) => s.linkId === l.id)) }))
        .filter((x): x is { link: WanLink; score: LinkScore } => x.score !== null);
      const worst = [...linkScores].sort((a, b) => a.score.score - b.score.score)[0];
      rows.push({
        edgeId: edge.id,
        name: edge.name,
        status: edge.status,
        healthScore: edge.status === 'DOWN' ? 0 : edgeHealthScore(linkScores.map((x) => x.score.score)),
        worstLink: worst ? { linkId: worst.link.id, grade: worst.score.grade, mos: worst.score.mos } : undefined,
      });
      for (const x of linkScores) {
        linkRows.push({ edgeId: edge.id, linkId: x.link.id, name: `${edge.name} / ${x.link.name}`, score: x.score.score, slaCompliancePct: x.score.slaCompliancePct });
      }
    }
    const scored = rows.filter((r) => r.healthScore > 0 || r.status === 'DOWN');
    return {
      range,
      averageScore: scored.length ? Math.round(scored.reduce((a, r) => a + r.healthScore, 0) / scored.length) : 0,
      edges: rows.sort((a, b) => a.healthScore - b.healthScore),
      worstLinks: linkRows.sort((a, b) => a.score - b.score).slice(0, 5),
    };
  }
}
```

## apps/sdwan-portal/api/src/services/InventoryService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/InventoryService.ts`.

```typescript
import { TtlCache } from '../cache/TtlCache';
import type { Edge, EdgeStatus, Site, Vendor } from '../domain/types';
import { NotFoundProblem, ProblemError } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { ProviderContext, SdwanProvider } from '../providers/SdwanProvider';
import type { TenantDirectory } from '../repositories';

export interface Inventory {
  sites: Site[];
  edges: Edge[];
  /** Vendors whose controller could not be reached; their edges are missing from the result. */
  unavailable: Vendor[];
  fetchedAt: string;
}

export interface ResolvedEdge {
  edge: Edge;
  provider: SdwanProvider;
  ctx: ProviderContext;
}

export interface InventorySummary {
  sites: number;
  edges: number;
  byStatus: Record<EdgeStatus, number>;
  byVendor: Record<Vendor, number>;
  links: number;
  linksDown: number;
  unavailable: Vendor[];
}

/**
 * Builds an Account's SD-WAN inventory by querying every controller tenant mapped to the
 * account, in parallel. One vendor being down must not blank the whole dashboard, so a
 * failing tenant is reported in `unavailable` instead of failing the request.
 */
export class InventoryService {
  private readonly cache: TtlCache<Inventory>;

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly tenants: TenantDirectory,
    private readonly logger: Logger,
    cacheTtlMs: number,
  ) {
    this.cache = new TtlCache<Inventory>(cacheTtlMs, 500);
  }

  async inventory(accountId: string, opts: { refresh?: boolean } = {}): Promise<Inventory> {
    const key = `inv:${accountId}`;
    if (opts.refresh) this.cache.delete(key);
    return this.cache.getOrLoad(key, () => this.load(accountId));
  }

  invalidate(accountId: string): void {
    this.cache.invalidatePrefix(`inv:${accountId}`);
  }

  private async load(accountId: string): Promise<Inventory> {
    const mappings = this.tenants.tenantsFor(accountId);
    const results = await Promise.allSettled(
      mappings.map(async (m) => {
        const provider = this.providers.get(m.vendor);
        const ctx: ProviderContext = { accountId, tenant: m.tenant };
        const [discovered, edges] = await Promise.all([provider.listSites(ctx), provider.listEdges(ctx)]);
        const prefix = m.vendor === 'VELOCLOUD' ? 'vc' : 'ft';
        const edgeIdByVendorId = new Map(edges.map((e) => [e.vendorRef.id, e.id]));
        const sites: Site[] = discovered.map((d) => ({
          id: `${prefix}-site-${m.tenant}-${d.vendorId}`,
          accountId,
          name: d.name,
          address: d.address ?? { line1: '', city: '', postcode: '', country: 'GB' },
          vendor: m.vendor,
          vendorRef: { vendor: m.vendor, tenant: m.tenant, id: d.vendorId },
          edgeIds: d.edgeVendorIds.map((v) => edgeIdByVendorId.get(v)).filter((x): x is string => !!x),
        }));
        // Normalise the edge → site link using the discovered site membership.
        const siteByEdge = new Map(sites.flatMap((s) => s.edgeIds.map((e) => [e, s.id] as const)));
        return { sites, edges: edges.map((e) => ({ ...e, accountId, siteId: siteByEdge.get(e.id) ?? e.siteId })) };
      }),
    );

    const inv: Inventory = { sites: [], edges: [], unavailable: [], fetchedAt: new Date().toISOString() };
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        inv.sites.push(...r.value.sites);
        inv.edges.push(...r.value.edges);
      } else {
        this.logger.warn('inventory fetch failed', { accountId, vendor: mappings[i].vendor, err: r.reason });
        if (!inv.unavailable.includes(mappings[i].vendor)) inv.unavailable.push(mappings[i].vendor);
      }
    });
    if (mappings.length > 0 && inv.unavailable.length === new Set(mappings.map((m) => m.vendor)).size) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (first?.reason instanceof ProblemError) throw first.reason;
    }
    inv.sites.sort((a, b) => a.name.localeCompare(b.name));
    inv.edges.sort((a, b) => a.name.localeCompare(b.name));
    return inv;
  }

  async listSites(accountId: string): Promise<Site[]> {
    return (await this.inventory(accountId)).sites;
  }

  async getSite(accountId: string, siteId: string): Promise<{ site: Site; edges: Edge[] }> {
    const inv = await this.inventory(accountId);
    const site = inv.sites.find((s) => s.id === siteId);
    if (!site) throw new NotFoundProblem('Site', siteId);
    return { site, edges: inv.edges.filter((e) => e.siteId === siteId) };
  }

  async listEdges(accountId: string, filter: { siteId?: string; status?: EdgeStatus } = {}): Promise<Edge[]> {
    const inv = await this.inventory(accountId);
    return inv.edges.filter((e) => (!filter.siteId || e.siteId === filter.siteId) && (!filter.status || e.status === filter.status));
  }

  async resolveEdge(accountId: string, edgeId: string): Promise<ResolvedEdge> {
    const inv = await this.inventory(accountId);
    const edge = inv.edges.find((e) => e.id === edgeId);
    if (!edge) throw new NotFoundProblem('Edge', edgeId);
    return {
      edge,
      provider: this.providers.get(edge.vendor),
      ctx: { accountId, tenant: edge.vendorRef.tenant },
    };
  }

  async resolveEdges(accountId: string, edgeIds: string[]): Promise<ResolvedEdge[]> {
    return Promise.all(edgeIds.map((id) => this.resolveEdge(accountId, id)));
  }

  async summary(accountId: string): Promise<InventorySummary> {
    const inv = await this.inventory(accountId);
    const byStatus: Record<EdgeStatus, number> = { UP: 0, DEGRADED: 0, DOWN: 0, UNKNOWN: 0 };
    const byVendor: Record<Vendor, number> = { VELOCLOUD: 0, FORTINET: 0 };
    let links = 0;
    let linksDown = 0;
    for (const e of inv.edges) {
      byStatus[e.status]++;
      byVendor[e.vendor]++;
      links += e.links.length;
      linksDown += e.links.filter((l) => l.state === 'DOWN').length;
    }
    return { sites: inv.sites.length, edges: inv.edges.length, byStatus, byVendor, links, linksDown, unavailable: inv.unavailable };
  }
}
```

## apps/sdwan-portal/api/src/services/MaintenanceWindowService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/MaintenanceWindowService.ts`.

```typescript
import { randomUUID } from 'node:crypto';
import { nextOccurrence, occurrencesBetween, validateWindow, WindowOccurrence } from '../domain/maintenanceWindows';
import type { MaintenanceWindow } from '../domain/types';
import { ConflictProblem, NotFoundProblem, ValidationProblem } from '../errors/problem';
import type { ChangeRequestRepository, MaintenanceWindowRepository } from '../repositories';
import type { MaintenanceWindowInput } from '../validation/schemas';

export interface WindowWithNext extends MaintenanceWindow {
  nextOpening?: WindowOccurrence;
}

const ACTIVE_CHANGE_STATES = new Set(['APPROVED', 'SCHEDULED', 'IN_PROGRESS']);

export class MaintenanceWindowService {
  constructor(
    private readonly repo: MaintenanceWindowRepository,
    private readonly changes: ChangeRequestRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertValid(input: MaintenanceWindowInput): void {
    const errors = validateWindow(input);
    if (errors.length) throw new ValidationProblem(errors.map((message) => ({ path: '(window)', message })));
  }

  async list(accountId: string): Promise<WindowWithNext[]> {
    const nowIso = this.now().toISOString();
    const windows = await this.repo.find((w) => w.accountId === accountId, (a, b) => a.name.localeCompare(b.name));
    return windows.map((w) => ({ ...w, nextOpening: nextOccurrence(w, nowIso) }));
  }

  async get(accountId: string, id: string): Promise<MaintenanceWindow> {
    const w = await this.repo.get(id);
    if (!w || w.accountId !== accountId) throw new NotFoundProblem('MaintenanceWindow', id);
    return w;
  }

  async create(accountId: string, input: MaintenanceWindowInput): Promise<MaintenanceWindow> {
    this.assertValid(input);
    const existing = await this.repo.find((w) => w.accountId === accountId && w.name.toLowerCase() === input.name.toLowerCase());
    if (existing.length) throw new ConflictProblem(`A maintenance window named "${input.name}" already exists`);
    return this.repo.insert({ id: `MW-${randomUUID()}`, accountId, ...input, daysOfWeek: [...input.daysOfWeek].sort() });
  }

  async update(accountId: string, id: string, input: MaintenanceWindowInput): Promise<MaintenanceWindow> {
    const current = await this.get(accountId, id);
    this.assertValid(input);
    await this.assertNotInUse(id, 'modified');
    return this.repo.update({ ...current, ...input, daysOfWeek: [...input.daysOfWeek].sort() });
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.get(accountId, id);
    await this.assertNotInUse(id, 'deleted');
    await this.repo.delete(id);
  }

  /** Every opening of every account window in the next `days`, chronologically — drives the scheduling picker. */
  async upcoming(accountId: string, days: number): Promise<Array<WindowOccurrence & { name: string }>> {
    const from = this.now();
    const to = new Date(from.getTime() + days * 86_400_000);
    const windows = await this.repo.find((w) => w.accountId === accountId);
    return windows
      .flatMap((w) => occurrencesBetween(w, from.toISOString(), to.toISOString()).map((o) => ({ ...o, name: w.name })))
      .filter((o) => o.end > from.toISOString())
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Changing a window under a scheduled change would silently move it outside its approved slot. */
  private async assertNotInUse(id: string, verb: string): Promise<void> {
    const using = await this.changes.find((c) => c.maintenanceWindowId === id && ACTIVE_CHANGE_STATES.has(c.status));
    if (using.length) {
      throw new ConflictProblem(`Window cannot be ${verb} while ${using.length} change request(s) are scheduled in it`, {
        changeRequestIds: using.map((c) => c.id),
      });
    }
  }
}
```

## apps/sdwan-portal/api/src/services/ReportService.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/ReportService.test.ts`.

```typescript
import type { LinkSample } from '../domain/types';
import { ACCOUNT, createHarness, HA_EDGE } from '../testing/harness';
import { LinkSlaRow, periodBounds, toCsv } from './ReportService';

describe('periodBounds', () => {
  it('covers the whole calendar month, clamped to now for the current month', () => {
    expect(periodBounds('2026-02', new Date('2026-03-02T10:00:00Z'))).toEqual({ from: '2026-02-01T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' });
    expect(periodBounds('2026-03', new Date('2026-03-02T10:00:00Z')).to).toBe('2026-03-02T10:00:00.000Z');
  });
});

describe('toCsv', () => {
  it('quotes cells containing delimiters and renders nulls as empty', () => {
    const row = { siteName: 'Branch, "North"', edgeName: 'e1', vendor: 'FORTINET', linkName: 'wan1', transport: 'FIBRE', samples: 0, coveragePct: 0, availabilityPct: null, slaCompliancePct: null, mos: null } as LinkSlaRow;
    expect(toCsv([row]).split('\r\n')[1]).toBe('"Branch, ""North""",e1,FORTINET,wan1,FIBRE,0,0,,,');
  });
});

describe('ReportService.slaReport', () => {
  it('rolls link availability up to site availability assuming independent failures', async () => {
    const h = createHarness();
    const mk = (link: string, minute: number, lossPct: number): LinkSample => ({
      edgeId: HA_EDGE,
      linkId: `${HA_EDGE}:${link}`,
      timestamp: new Date(Date.UTC(2026, 2, 2, 9, minute)).toISOString(),
      latencyMs: 10,
      jitterMs: 1,
      lossPct,
      rxBps: 0,
      txBps: 0,
    });
    // GE3 unreachable for half the samples, GE4 for a quarter.
    h.c.repos.metrics.append([0, 5, 10, 15].flatMap((m, i) => [mk('GE3', m, i < 2 ? 100 : 0), mk('GE4', m, i < 1 ? 100 : 0)]));

    const report = await h.c.reports.slaReport(ACCOUNT, '2026-03');
    const ge3 = report.links.find((l) => l.linkId.endsWith('GE3'))!;
    const ge4 = report.links.find((l) => l.linkId.endsWith('GE4'))!;
    expect([ge3.availabilityPct, ge4.availabilityPct]).toEqual([50, 75]);
    const hq = report.sites.find((s) => s.siteName === 'Head Office' && s.availabilityPct !== null)!;
    expect(hq.availabilityPct).toBe(87.5);
  });
});
```

## apps/sdwan-portal/api/src/services/ReportService.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/services/ReportService.ts`.

```typescript
import { scoreLink } from '../domain/linkScoring';
import { round } from '../domain/metricsAggregation';
import type { Vendor } from '../domain/types';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { InventoryService } from './InventoryService';

/** Poll interval the coverage figure is measured against (one sample per link per 5 minutes). */
const EXPECTED_SAMPLE_SECONDS = 300;

export interface LinkSlaRow {
  siteName: string;
  edgeId: string;
  edgeName: string;
  vendor: Vendor;
  linkId: string;
  linkName: string;
  transport: string;
  samples: number;
  /** % of the period for which samples exist; low coverage makes the other figures indicative only. */
  coveragePct: number;
  availabilityPct: number | null;
  slaCompliancePct: number | null;
  mos: number | null;
}

export interface SiteSlaRow {
  siteId: string;
  siteName: string;
  /** A site is available when at least one of its links is — the point of SD-WAN. */
  availabilityPct: number | null;
  worstLinkCompliancePct: number | null;
}

export interface SlaReport {
  period: string;
  from: string;
  to: string;
  generatedAt: string;
  sites: SiteSlaRow[];
  links: LinkSlaRow[];
}

export function periodBounds(period: string, now: Date): { from: string; to: string } {
  const [y, m] = period.split('-').map(Number);
  const from = Date.UTC(y, m - 1, 1);
  const end = Date.UTC(y, m, 1);
  return { from: new Date(from).toISOString(), to: new Date(Math.min(end, now.getTime())).toISOString() };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: LinkSlaRow[]): string {
  const cols: Array<keyof LinkSlaRow> = [
    'siteName', 'edgeName', 'vendor', 'linkName', 'transport', 'samples', 'coveragePct', 'availabilityPct', 'slaCompliancePct', 'mos',
  ];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
}

export class ReportService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly metrics: MetricsStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async slaReport(accountId: string, period: string): Promise<SlaReport> {
    const now = this.now();
    const { from, to } = periodBounds(period, now);
    const expected = Math.max(1, Math.floor((Date.parse(to) - Date.parse(from)) / 1000 / EXPECTED_SAMPLE_SECONDS));
    const inv = await this.inventory.inventory(accountId);
    const siteName = new Map(inv.sites.map((s) => [s.id, s.name]));

    const links: LinkSlaRow[] = [];
    const bySite = new Map<string, { availability: number[]; compliance: number[] }>();
    for (const edge of inv.edges) {
      const samples = this.metrics.queryEdge(edge.id, from, to);
      for (const link of edge.links) {
        const score = scoreLink(samples.filter((s) => s.linkId === link.id));
        links.push({
          siteName: siteName.get(edge.siteId) ?? edge.siteId,
          edgeId: edge.id,
          edgeName: edge.name,
          vendor: edge.vendor,
          linkId: link.id,
          linkName: link.name,
          transport: link.transport,
          samples: score?.samples ?? 0,
          coveragePct: round(Math.min(100, ((score?.samples ?? 0) / expected) * 100), 1),
          availabilityPct: score?.availabilityPct ?? null,
          slaCompliancePct: score?.slaCompliancePct ?? null,
          mos: score?.mos ?? null,
        });
        if (score) {
          const agg = bySite.get(edge.siteId) ?? { availability: [], compliance: [] };
          agg.availability.push(score.availabilityPct);
          agg.compliance.push(score.slaCompliancePct);
          bySite.set(edge.siteId, agg);
        }
      }
    }

    const sites: SiteSlaRow[] = inv.sites.map((s) => {
      const agg = bySite.get(s.id);
      if (!agg) return { siteId: s.id, siteName: s.name, availabilityPct: null, worstLinkCompliancePct: null };
      // Links fail independently enough that P(site down) ~= product of P(link down).
      const downProduct = agg.availability.reduce((p, a) => p * (1 - a / 100), 1);
      return {
        siteId: s.id,
        siteName: s.name,
        availabilityPct: round((1 - downProduct) * 100, 3),
        worstLinkCompliancePct: Math.min(...agg.compliance),
      };
    });

    return { period, from, to, generatedAt: now.toISOString(), sites, links };
  }
}
```

## apps/sdwan-portal/api/src/testing/fakeFetch.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/testing/fakeFetch.ts`.

```typescript
import type { FetchLike } from '../providers/http/HttpClient';

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Scripted fetch for vendor client tests: replies are consumed in order and every request
 * is recorded. Responses are plain objects (not undici Responses) so headers such as
 * Set-Cookie are not filtered.
 */
export function fakeFetch(replies: FakeReply[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const queue = [...replies];
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: String(init.method),
      headers: { ...(init.headers as Record<string, string>) },
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = queue.shift();
    if (!reply) throw new Error(`unexpected request to ${url}`);
    const status = reply.status ?? 200;
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(reply.headers ?? {}),
      text: async () => text,
    } as unknown as Response;
  };
  return { fetch, calls };
}

export const noSleep = async (): Promise<void> => undefined;
```

## apps/sdwan-portal/api/src/testing/harness.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/testing/harness.ts`.

```typescript
import { signDevToken } from '../auth/jwt';
import { loadConfig } from '../config/env';
import { Container, createContainer, MOCK_TENANTS } from '../container';
import type { Principal, Role, Vendor } from '../domain/types';
import { silentLogger } from '../logging/logger';
import { MockProvider } from '../providers/mock/MockProvider';
import { ProviderRegistry } from '../providers/ProviderRegistry';

export const ACCOUNT = 'ACC-10000001';
export const OTHER_ACCOUNT = 'ACC-20000002';
/** VeloCloud HA edge at Head Office. */
export const HA_EDGE = 'vc-1001-hq-edge-1';
/** Fortinet single-link, non-HA edge in Sheffield. */
export const SOLO_EDGE = 'ft-acme-sheff-edge-1';

export class TestClock {
  constructor(public ms = Date.parse('2026-03-02T10:00:00.000Z')) {}
  now = (): Date => new Date(this.ms);
  advance(minutes: number): void {
    this.ms += minutes * 60_000;
  }
}

export interface Harness {
  c: Container;
  clock: TestClock;
  mocks: Record<Vendor, MockProvider>;
  principal(userId: string, role: Role, accountId?: string): Principal;
  token(userId: string, role: Role, accountId?: string): string;
}

export function createHarness(): Harness {
  const cfg = loadConfig({ JWT_SECRET: 'test-secret', SDWAN_PROVIDER_MODE: 'mock', NODE_ENV: 'test' });
  const mocks: Record<Vendor, MockProvider> = { VELOCLOUD: new MockProvider('VELOCLOUD'), FORTINET: new MockProvider('FORTINET') };
  const providers = new ProviderRegistry(new Map(Object.entries(mocks) as Array<[Vendor, MockProvider]>));
  const clock = new TestClock();
  const c = createContainer(cfg, silentLogger, { providers, tenants: MOCK_TENANTS, now: clock.now });
  const principal = (userId: string, role: Role, accountId: string | undefined = ACCOUNT): Principal => ({
    userId,
    roles: [role],
    accountId: role === 'SUPPORT_AGENT' ? undefined : accountId,
  });
  return {
    c,
    clock,
    mocks,
    principal,
    token: (userId, role, accountId) => signDevToken(principal(userId, role, accountId), c.jwt),
  };
}
```

## apps/sdwan-portal/api/src/validation/schemas.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/validation/schemas.test.ts`.

```typescript
import { ValidationProblem } from '../errors/problem';
import { businessPolicySchema, createChangeRequestSchema, decisionSchema, firewallRuleSchema, paginationQuery, timeRangeQuery } from './schemas';
import { parse } from './validate';

function issues(fn: () => unknown): Array<{ path: string; message: string }> {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationProblem);
    return (e as ValidationProblem).extensions.errors as Array<{ path: string; message: string }>;
  }
  throw new Error('expected validation to fail');
}

describe('request schemas', () => {
  it('coerces and bounds pagination', () => {
    expect(parse(paginationQuery, {})).toEqual({ page: 1, pageSize: 25 });
    expect(parse(paginationQuery, { page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
    expect(issues(() => parse(paginationQuery, { pageSize: '500' }))[0].path).toBe('pageSize');
  });

  it('defaults the time range to the last 24h and caps it at 93 days', () => {
    const r = parse(timeRangeQuery, { to: '2026-03-02T00:00:00Z' });
    expect(r.from).toBe('2026-03-01T00:00:00.000Z');
    expect(issues(() => parse(timeRangeQuery, { from: '2025-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }))[0].message).toMatch(/93 days/);
    expect(issues(() => parse(timeRangeQuery, { from: '2026-03-02' }))[0].message).toMatch(/timezone/);
  });

  it('requires a transport for transport steering and rejects unknown applications', () => {
    const base = { id: 'p', name: 'Backup', order: 1, match: { applications: ['veeam'] }, action: { serviceClass: 'BULK', priority: 'LOW', steering: 'PREFERRED_TRANSPORT' } };
    const errs = issues(() => parse(businessPolicySchema, base));
    expect(errs).toEqual([expect.objectContaining({ path: 'action.preferredTransport' })]);
    expect(issues(() => parse(businessPolicySchema, { ...base, match: { applications: ['tiktok'] }, action: { ...base.action, preferredTransport: 'MPLS' } }))[0].message).toMatch(/tiktok/);
  });

  it('forbids ports on ICMP firewall rules and malformed CIDRs', () => {
    const rule = { id: 'r', name: 'ping', sequence: 1, action: 'ALLOW', protocol: 'ICMP', sourceCidrs: ['10.0.0.0/8'], destinationCidrs: ['10.0.0.300/32'], destinationPorts: [{ from: 1, to: 2 }] };
    expect(issues(() => parse(firewallRuleSchema, rule)).map((i) => i.path).sort()).toEqual(['destinationCidrs.0']);
    expect(issues(() => parse(firewallRuleSchema, { ...rule, destinationCidrs: [] }))[0].path).toBe('destinationPorts');
  });

  it('enforces single-edge rollbacks, unique edges and justified rejections', () => {
    const cr = { title: 'Roll back', edgeIds: ['a', 'b'], payload: { type: 'CONFIG_ROLLBACK', backupId: 'BKP-1' } };
    expect(issues(() => parse(createChangeRequestSchema, cr))[0].message).toMatch(/exactly one edge/);
    expect(issues(() => parse(createChangeRequestSchema, { ...cr, edgeIds: ['a', 'a'] }))[0].message).toMatch(/unique/);
    expect(issues(() => parse(createChangeRequestSchema, { ...cr, edgeIds: ['a'], extra: 1 }))[0].message).toMatch(/Unrecognized key/);
    expect(issues(() => parse(decisionSchema, { decision: 'REJECT', comment: 'no' }))[0].path).toBe('comment');
    expect(parse(decisionSchema, { decision: 'APPROVE' })).toEqual({ decision: 'APPROVE' });
  });
});
```

## apps/sdwan-portal/api/src/validation/schemas.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/validation/schemas.ts`.

```typescript
import { z } from 'zod';
import { isValidCidr } from '../domain/cidr';
import { unknownApplications } from '../providers/applicationCatalog';

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(s), {
  message: 'must be an ISO-8601 date-time with timezone',
});

export const accountIdParam = z.string().regex(/^ACC-\d{8}$/, 'accountId must look like ACC-########');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const timeRangeQuery = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
  })
  .transform((v) => {
    const to = v.to ?? new Date().toISOString();
    const from = v.from ?? new Date(Date.parse(to) - 24 * 3_600_000).toISOString();
    return { from, to };
  })
  .refine((v) => Date.parse(v.from) < Date.parse(v.to), { message: '"from" must be before "to"' })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 93 * 86_400_000, { message: 'range may not exceed 93 days' });

const cidr = z.string().refine(isValidCidr, { message: 'must be an IPv4 CIDR such as 10.0.0.0/24' });

const portRange = z
  .object({ from: z.number().int().min(1).max(65535), to: z.number().int().min(1).max(65535) })
  .refine((p) => p.from <= p.to, { message: '"from" must be <= "to"' });

const protocol = z.enum(['TCP', 'UDP', 'ICMP', 'ANY']);
const transport = z.enum(['FIBRE', 'BROADBAND', 'LTE', 'MPLS']);

export const slaSchema = z.object({
  maxLatencyMs: z.number().positive().max(5000),
  maxJitterMs: z.number().min(0).max(1000),
  maxLossPct: z.number().min(0).max(100),
});

export const businessPolicySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(60),
    order: z.number().int().min(0).max(100000),
    enabled: z.boolean().default(true),
    match: z
      .object({
        applications: z
          .array(z.string())
          .max(20)
          .optional()
          .superRefine((apps, ctx) => {
            const unknown = unknownApplications(apps ?? []);
            if (unknown.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `unknown application(s): ${unknown.join(', ')}` });
          }),
        sourceCidrs: z.array(cidr).max(32).optional(),
        destinationCidrs: z.array(cidr).max(32).optional(),
        protocol: protocol.optional(),
        destinationPorts: z.array(portRange).max(16).optional(),
        dscp: z.number().int().min(0).max(63).optional(),
      })
      .strict(),
    action: z
      .object({
        serviceClass: z.enum(['REALTIME', 'TRANSACTIONAL', 'BULK']),
        priority: z.enum(['HIGH', 'NORMAL', 'LOW']),
        steering: z.enum(['BEST_PATH', 'PREFERRED_TRANSPORT', 'LOAD_BALANCE', 'MANDATORY_TRANSPORT']),
        preferredTransport: transport.optional(),
        sla: slaSchema.optional(),
        rateLimitKbps: z.number().int().min(64).max(10_000_000).optional(),
        dscpRemark: z.number().int().min(0).max(63).optional(),
      })
      .strict()
      .refine(
        (a) => !(a.steering === 'PREFERRED_TRANSPORT' || a.steering === 'MANDATORY_TRANSPORT') || !!a.preferredTransport,
        { message: 'preferredTransport is required for transport steering', path: ['preferredTransport'] },
      ),
  })
  .strict();

export const firewallRuleSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(35),
    sequence: z.number().int().min(1).max(100000),
    enabled: z.boolean().default(true),
    action: z.enum(['ALLOW', 'DENY']),
    protocol,
    sourceCidrs: z.array(cidr).max(32),
    destinationCidrs: z.array(cidr).max(32),
    destinationPorts: z.array(portRange).max(16),
    log: z.boolean().default(false),
  })
  .strict()
  .refine((r) => !(r.protocol === 'ICMP' && r.destinationPorts.length > 0), {
    message: 'ICMP rules cannot specify ports',
    path: ['destinationPorts'],
  });

const payloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('POLICY_UPDATE'), policies: z.array(businessPolicySchema).max(500) }),
  z.object({ type: z.literal('FIREWALL_UPDATE'), rules: z.array(firewallRuleSchema).max(1000) }),
  z.object({ type: z.literal('CONFIG_ROLLBACK'), backupId: z.string().min(1) }),
  z.object({ type: z.literal('SOFTWARE_UPGRADE'), targetVersion: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be x.y.z') }),
  z.object({ type: z.literal('EDGE_REBOOT') }),
]);

export const createChangeRequestSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().max(2000).optional(),
    edgeIds: z.array(z.string().min(1)).min(1).max(100),
    payload: payloadSchema,
    emergency: z.boolean().default(false),
    submit: z.boolean().default(false),
  })
  .strict()
  .refine((v) => new Set(v.edgeIds).size === v.edgeIds.length, { message: 'edgeIds must be unique', path: ['edgeIds'] })
  .refine((v) => v.payload.type !== 'CONFIG_ROLLBACK' || v.edgeIds.length === 1, {
    message: 'a rollback targets exactly one edge',
    path: ['edgeIds'],
  });

export const decisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    comment: z.string().max(1000).optional(),
  })
  .strict()
  .refine((v) => v.decision === 'APPROVE' || (v.comment && v.comment.trim().length >= 5), {
    message: 'a rejection requires a comment of at least 5 characters',
    path: ['comment'],
  });

export const scheduleSchema = z
  .object({
    maintenanceWindowId: z.string().min(1).optional(),
    scheduledFor: isoDateTime,
  })
  .strict();

export const maintenanceWindowSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:mm (UTC)'),
    durationMinutes: z.number().int().min(30).max(720),
    blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(100).default([]),
  })
  .strict();

export const createBackupSchema = z.object({ edgeId: z.string().min(1) }).strict();

export const alertQuerySchema = paginationQuery.extend({
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional(),
  severity: z.enum(['CRITICAL', 'MAJOR', 'MINOR', 'INFO']).optional(),
  edgeId: z.string().optional(),
});

export const changeQuerySchema = paginationQuery.extend({
  status: z
    .enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .optional(),
  type: z.enum(['POLICY_UPDATE', 'FIREWALL_UPDATE', 'CONFIG_ROLLBACK', 'SOFTWARE_UPGRADE', 'EDGE_REBOOT']).optional(),
});

export const reportQuerySchema = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM'),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;
export type MaintenanceWindowInput = z.infer<typeof maintenanceWindowSchema>;
```

## apps/sdwan-portal/api/src/validation/validate.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/validation/validate.ts`.

```typescript
import type { ZodTypeAny, z } from 'zod';
import { zodToValidationProblem } from '../errors/problem';

/** Parses `input` with `schema`, throwing a 400 problem listing every invalid field. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw zodToValidationProblem(result.error);
  return result.data;
}
```

## apps/sdwan-portal/api/tsconfig.build.json

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: json. Path: `apps/sdwan-portal/api/tsconfig.build.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "exclude": ["src/**/*.test.ts", "src/testing/**"]
}
```

## apps/sdwan-portal/api/tsconfig.json

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: json. Path: `apps/sdwan-portal/api/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts"]
}
```

## apps/sdwan-portal/web/.env.example

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: bash. Path: `apps/sdwan-portal/web/.env.example`.

```bash
# API origin the Vite dev server proxies /api to
VITE_API_PROXY=http://localhost:8080
# OIDC authorize endpoint; the IdP returns the access token in the URL fragment
VITE_OIDC_AUTHORIZE_URL=https://login.example-uniti.net/realms/selfcare/protocol/openid-connect/auth
VITE_OIDC_CLIENT_ID=sdwan-portal
```

## apps/sdwan-portal/web/index.html

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: html. Path: `apps/sdwan-portal/web/index.html`.

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SD-WAN | Uniti Business</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## apps/sdwan-portal/web/package.json

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: json. Path: `apps/sdwan-portal/web/package.json`.

```json
{
  "name": "@uniti/sdwan-portal-web",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.5",
    "@testing-library/react": "^15.0.7",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.4.5",
    "vite": "^5.2.12",
    "vitest": "^1.6.0"
  }
}
```

## apps/sdwan-portal/web/src/App.tsx

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: tsx. Path: `apps/sdwan-portal/web/src/App.tsx`.

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { AlertsPage } from './pages/AlertsPage';
import { ChangeRequestDetailPage } from './pages/ChangeRequestDetailPage';
import { ChangeRequestsPage } from './pages/ChangeRequestsPage';
import { EdgeDetailPage } from './pages/EdgeDetailPage';
import { FirewallPage } from './pages/FirewallPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PoliciesPage } from './pages/PoliciesPage';

const NOT_PERMITTED = <p>Your role does not include access to this area.</p>;

export function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="edges/:edgeId" element={<EdgeDetailPage />} />
        <Route
          path="policies"
          element={
            <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN']} fallback={NOT_PERMITTED}>
              <PoliciesPage />
            </RequireRole>
          }
        />
        <Route
          path="firewall"
          element={
            <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN']} fallback={NOT_PERMITTED}>
              <FirewallPage />
            </RequireRole>
          }
        />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="changes" element={<ChangeRequestsPage />} />
        <Route path="changes/:changeId" element={<ChangeRequestDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

## apps/sdwan-portal/web/src/api/client.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/api/client.test.ts`.

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createApiClient } from './client';

function respond(status: number, body: unknown, contentType = 'application/json', headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType, ...headers } }));
}

const make = (fetchImpl: ReturnType<typeof respond>, onUnauthorized = vi.fn()) =>
  createApiClient({ baseUrl: '/api/v1', getToken: () => 'tok', onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch, newId: () => 'cid-00000001' });

describe('buildQuery', () => {
  it('drops empty values and encodes the rest', () => {
    expect(buildQuery({ page: 2, q: 'a b', status: undefined, vendor: '' })).toBe('?page=2&q=a+b');
    expect(buildQuery({})).toBe('');
  });
});

describe('createApiClient', () => {
  it('sends bearer token, correlation id and JSON body', async () => {
    const f = respond(201, { id: 'CR-1' });
    await expect(make(f).post('/x', { a: 1 }, { query: { dry: true } })).resolves.toEqual({ id: 'CR-1' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/x?dry=true');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Correlation-Id': 'cid-00000001', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('raises problem+json errors with field errors and the server correlation id', async () => {
    const problem = { type: 'x/validation', title: 'Request validation failed', status: 400, correlationId: 'srv-1', errors: [{ path: 'title', message: 'too short' }] };
    const err = (await make(respond(400, problem, 'application/problem+json')).get('/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.correlationId).toBe('srv-1');
    expect(err.fieldErrors()).toEqual({ title: 'too short' });
  });

  it('normalises non-problem failures and signals 401s', async () => {
    const onUnauthorized = vi.fn();
    const err = (await make(respond(401, '<html>nope</html>', 'text/html', { 'X-Correlation-Id': 'echo-1' }), onUnauthorized).get('/x').catch((e) => e)) as ApiError;
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(err.problem.status).toBe(401);
    expect(err.correlationId).toBe('echo-1');
  });

  it('maps network failures to status 0 but lets aborts through', async () => {
    const network = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(make(network as never).get('/x')).rejects.toMatchObject({ status: 0 });
    const abort = vi.fn(async () => Promise.reject(new DOMException('aborted', 'AbortError')));
    await expect(make(abort as never).get('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns undefined for 204', async () => {
    await expect(make(respond(204, null)).del('/x')).resolves.toBeUndefined();
  });
});
```

## apps/sdwan-portal/web/src/api/client.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/api/client.ts`.

```typescript
/** RFC 7807 body as returned by the API, including our extensions. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  correlationId?: string;
  errors?: Array<{ path: string; message: string }>;
  [extension: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly correlationId: string,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Field-level messages keyed by path, for showing next to form inputs. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

export interface ClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
  newId?: () => string;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export function buildQuery(query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Thin fetch wrapper: attaches the bearer token and a fresh X-Correlation-Id per call,
 * and turns any non-2xx into an ApiError carrying the problem document. Non-problem error
 * bodies (proxy HTML, empty 502s) are normalised into a synthetic problem so callers only
 * ever handle one error shape.
 */
export function createApiClient(cfg: ClientConfig) {
  const doFetch = cfg.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const newId = cfg.newId ?? (() => crypto.randomUUID());

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const correlationId = newId();
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', 'X-Correlation-Id': correlationId };
    const token = cfg.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError({ type: 'about:blank', title: 'Network error', status: 0, detail: 'The SD-WAN service could not be reached' }, correlationId);
    }

    const echoed = res.headers.get('X-Correlation-Id') ?? correlationId;
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get('Content-Type') ?? '';
    const isJson = /json/.test(contentType);
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      if (res.status === 401) cfg.onUnauthorized();
      const problem: ProblemDetails =
        isJson && body && typeof body === 'object' && 'status' in body
          ? (body as ProblemDetails)
          : { type: 'about:blank', title: res.statusText || 'Request failed', status: res.status };
      throw new ApiError(problem, problem.correlationId ?? echoed);
    }
    return body as T;
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body: body ?? {} }),
    put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
    del: (path: string, opts?: RequestOptions) => request<void>('DELETE', path, opts),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
```

## apps/sdwan-portal/web/src/api/sdwan.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/api/sdwan.ts`.

```typescript
import type { ApiClient } from './client';
import type {
  Alert,
  AlertSeverity,
  AlertStatus,
  BusinessPolicy,
  ChangeRequest,
  ChangeRequestView,
  ChangeStatus,
  CreateChangeRequest,
  Edge,
  EdgeHealth,
  EdgeStatus,
  Finding,
  FirewallRule,
  FirewallView,
  InventorySummary,
  Page,
  PolicyView,
  SdwanEvent,
  Site,
  Vendor,
  WindowOccurrence,
} from './types';

export interface PageQuery {
  page: number;
  pageSize: number;
}

/** Typed endpoint bindings for one account; every path lives here so pages never build URLs. */
export function sdwanApi(client: ApiClient, accountId: string) {
  const a = `/accounts/${encodeURIComponent(accountId)}`;
  const id = encodeURIComponent;
  return {
    summary: (signal?: AbortSignal) => client.get<InventorySummary>(`${a}/summary`, { signal }),
    sites: (q: PageQuery, signal?: AbortSignal) => client.get<Page<Site>>(`${a}/sites`, { query: { ...q }, signal }),
    edges: (q: PageQuery & { status?: EdgeStatus; vendor?: Vendor; q?: string; siteId?: string }, signal?: AbortSignal) =>
      client.get<Page<Edge>>(`${a}/edges`, { query: { ...q }, signal }),
    edge: (edgeId: string, signal?: AbortSignal) => client.get<Edge>(`${a}/edges/${id(edgeId)}`, { signal }),
    edgeHealth: (edgeId: string, range: { from: string; to: string }, signal?: AbortSignal) =>
      client.get<EdgeHealth>(`${a}/edges/${id(edgeId)}/health`, { query: range, signal }),
    events: (q: { from: string; to: string; edgeId?: string; limit?: number }, signal?: AbortSignal) =>
      client.get<{ items: SdwanEvent[]; unavailable: Vendor[] }>(`${a}/events`, { query: q, signal }),

    policies: (edgeId: string, signal?: AbortSignal) => client.get<PolicyView>(`${a}/edges/${id(edgeId)}/policies`, { signal }),
    previewPolicies: (edgeIds: string[], policies: BusinessPolicy[]) =>
      client.post<{ valid: boolean; issues: Finding[]; warnings: Array<{ policyId: string; message: string; vendor: Vendor }> }>(
        `${a}/policies/preview`,
        { edgeIds, policies },
      ),
    firewall: (edgeId: string, signal?: AbortSignal) => client.get<FirewallView>(`${a}/edges/${id(edgeId)}/firewall-rules`, { signal }),
    previewFirewall: (rules: FirewallRule[]) => client.post<{ valid: boolean; findings: Finding[] }>(`${a}/firewall-rules/preview`, { rules }),

    alerts: (q: PageQuery & { status?: AlertStatus; severity?: AlertSeverity; edgeId?: string }, signal?: AbortSignal) =>
      client.get<Page<Alert>>(`${a}/alerts`, { query: { ...q }, signal }),
    acknowledgeAlert: (alertId: string) => client.post<Alert>(`${a}/alerts/${id(alertId)}/acknowledge`),

    changes: (q: PageQuery & { status?: ChangeStatus }, signal?: AbortSignal) =>
      client.get<Page<ChangeRequest>>(`${a}/change-requests`, { query: { ...q }, signal }),
    change: (crId: string, signal?: AbortSignal) => client.get<ChangeRequestView>(`${a}/change-requests/${id(crId)}`, { signal }),
    createChange: (body: CreateChangeRequest) => client.post<ChangeRequestView>(`${a}/change-requests`, body),
    submitChange: (crId: string) => client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/submit`),
    decideChange: (crId: string, decision: 'APPROVE' | 'REJECT', comment?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/decisions`, { decision, ...(comment ? { comment } : {}) }),
    scheduleChange: (crId: string, scheduledFor: string, maintenanceWindowId?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/schedule`, { scheduledFor, ...(maintenanceWindowId ? { maintenanceWindowId } : {}) }),
    cancelChange: (crId: string, reason?: string) =>
      client.post<ChangeRequestView>(`${a}/change-requests/${id(crId)}/cancel`, reason ? { reason } : {}),
    upcomingWindows: (days = 14, signal?: AbortSignal) =>
      client.get<WindowOccurrence[]>(`${a}/maintenance-windows/upcoming`, { query: { days }, signal }),
  };
}

export type SdwanApi = ReturnType<typeof sdwanApi>;
```

## apps/sdwan-portal/web/src/api/types.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/web/src/api/types.ts`.

```typescript
/** Wire types mirrored from the API's vendor-neutral domain model (api/src/domain/types.ts). */

export type Vendor = 'VELOCLOUD' | 'FORTINET';
export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT' | 'PARTNER_ADMIN' | 'PARTNER_AGENT';
export type EdgeStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type LinkState = 'UP' | 'DOWN' | 'STANDBY' | 'UNKNOWN';
export type Transport = 'FIBRE' | 'BROADBAND' | 'LTE' | 'MPLS' | 'UNKNOWN';
export type Protocol = 'TCP' | 'UDP' | 'ICMP' | 'ANY';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Site {
  id: string;
  name: string;
  vendor: Vendor;
  address: { line1: string; city: string; postcode: string; country: string };
  edgeIds: string[];
}

export interface WanLink {
  id: string;
  edgeId: string;
  name: string;
  interface: string;
  transport: Transport;
  ispName?: string;
  publicIp?: string;
  bandwidthDownKbps: number;
  bandwidthUpKbps: number;
  state: LinkState;
}

export interface Edge {
  id: string;
  siteId: string;
  vendor: Vendor;
  name: string;
  model: string;
  serialNumber: string;
  softwareVersion: string;
  status: EdgeStatus;
  haState: 'STANDALONE' | 'ACTIVE' | 'STANDBY' | 'FAILED';
  lastContact?: string;
  links: WanLink[];
}

export interface InventorySummary {
  sites: number;
  edges: number;
  byStatus: Record<EdgeStatus, number>;
  byVendor: Record<Vendor, number>;
  links: number;
  linksDown: number;
  unavailable: Vendor[];
}

export interface MetricStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface TimeBucket {
  start: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
  samples: number;
}

export interface LinkHealth {
  link: WanLink;
  aggregate: { latencyMs: MetricStats; jitterMs: MetricStats; lossPct: MetricStats; avgRxBps: number; avgTxBps: number } | null;
  score: { score: number; mos: number; grade: 'GOOD' | 'FAIR' | 'POOR' | 'BAD'; slaCompliancePct: number; availabilityPct: number } | null;
  utilisation: { rxP95Pct: number; txP95Pct: number };
  series: TimeBucket[];
}

export interface EdgeHealth {
  range: { from: string; to: string };
  bucketSeconds: number;
  healthScore: number;
  links: LinkHealth[];
  dataSource: 'store' | 'controller';
}

export interface PortRange {
  from: number;
  to: number;
}

export interface BusinessPolicy {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  match: {
    applications?: string[];
    sourceCidrs?: string[];
    destinationCidrs?: string[];
    protocol?: Protocol;
    destinationPorts?: PortRange[];
    dscp?: number;
  };
  action: {
    serviceClass: 'REALTIME' | 'TRANSACTIONAL' | 'BULK';
    priority: 'HIGH' | 'NORMAL' | 'LOW';
    steering: 'BEST_PATH' | 'PREFERRED_TRANSPORT' | 'LOAD_BALANCE' | 'MANDATORY_TRANSPORT';
    preferredTransport?: Transport;
    rateLimitKbps?: number;
    dscpRemark?: number;
  };
}

export interface FirewallRule {
  id: string;
  name: string;
  sequence: number;
  enabled: boolean;
  action: 'ALLOW' | 'DENY';
  protocol: Protocol;
  sourceCidrs: string[];
  destinationCidrs: string[];
  destinationPorts: PortRange[];
  log: boolean;
}

export interface Finding {
  ruleId?: string;
  policyId?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code?: string;
  message: string;
}

export interface PolicyView {
  edgeId: string;
  vendor: Vendor;
  policies: BusinessPolicy[];
  issues: Finding[];
  warnings: Array<{ policyId: string; field: string; message: string }>;
}

export interface FirewallView {
  edgeId: string;
  vendor: Vendor;
  rules: FirewallRule[];
  findings: Finding[];
}

export type AlertSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alert {
  id: string;
  edgeId: string;
  linkId?: string;
  type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  occurrences: number;
  raisedAt: string;
  lastSeenAt: string;
  acknowledgedBy?: string;
}

export interface SdwanEvent {
  id: string;
  edgeId?: string;
  vendor: Vendor;
  occurredAt: string;
  category: string;
  severity: AlertSeverity;
  message: string;
}

export type ChangeType = 'POLICY_UPDATE' | 'FIREWALL_UPDATE' | 'CONFIG_ROLLBACK' | 'SOFTWARE_UPGRADE' | 'EDGE_REBOOT';
export type ChangeStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ChangePayload =
  | { type: 'POLICY_UPDATE'; policies: BusinessPolicy[] }
  | { type: 'FIREWALL_UPDATE'; rules: FirewallRule[] }
  | { type: 'CONFIG_ROLLBACK'; backupId: string }
  | { type: 'SOFTWARE_UPGRADE'; targetVersion: string }
  | { type: 'EDGE_REBOOT' };

export interface ChangeRequest {
  id: string;
  title: string;
  description?: string;
  type: ChangeType;
  edgeIds: string[];
  payload: ChangePayload;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskReasons: string[];
  emergency: boolean;
  status: ChangeStatus;
  requestedBy: string;
  approvals: Array<{ userId: string; role: Role; decision: 'APPROVE' | 'REJECT'; comment?: string; decidedAt: string }>;
  scheduledFor?: string;
  maintenanceWindowId?: string;
  results: Array<{ edgeId: string; ok: boolean; error?: string; finishedAt: string }>;
  history: Array<{ at: string; by: string; from: ChangeStatus | null; to: ChangeStatus; note?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequestView extends ChangeRequest {
  approvalPolicy: { requiredApprovals: number; requiredRoles: Role[]; requiresMaintenanceWindow: boolean };
  outstanding: string[];
  lintFindings?: Finding[];
}

export interface WindowOccurrence {
  windowId: string;
  name: string;
  start: string;
  end: string;
}

export interface CreateChangeRequest {
  title: string;
  description?: string;
  edgeIds: string[];
  payload: ChangePayload;
  emergency?: boolean;
  submit?: boolean;
}
```
