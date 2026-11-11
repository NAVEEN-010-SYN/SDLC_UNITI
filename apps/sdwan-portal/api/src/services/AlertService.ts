import { randomUUID } from 'node:crypto';
import { DEFAULT_SLA } from '../domain/linkScoring';
import { aggregateLink } from '../domain/metricsAggregation';
import type { Alert, AlertSeverity, AlertStatus, AlertType, Edge, LinkSample, Page, Principal, SdwanEvent, SlaThresholds, Vendor } from '../domain/types';
import { ConflictProblem, NotFoundProblem } from '../errors/problem';
import type { Logger } from '../logging/logger';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { AlertRepository, TenantDirectory } from '../repositories';
import type { PageRequest } from '../repositories/InMemoryRepository';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { InventoryService } from './InventoryService';

export interface AlertCondition {
  type: AlertType;
  edgeId: string;
  linkId?: string;
  severity: AlertSeverity;
  message: string;
}

export interface AlertFilter extends PageRequest {
  status?: AlertStatus;
  severity?: AlertSeverity;
  edgeId?: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 4, MAJOR: 3, MINOR: 2, INFO: 1 };

/** Alert types this service derives from inventory and metrics; vendor-pushed types are never auto-resolved here. */
const EVALUATED_TYPES: ReadonlySet<AlertType> = new Set(['EDGE_DOWN', 'LINK_DOWN', 'HIGH_LATENCY', 'HIGH_JITTER', 'HIGH_LOSS']);

/** Minimum samples in the evaluation window before quality alerts fire, so one late probe cannot page anyone. */
const MIN_SAMPLES = 3;

export function fingerprintOf(c: Pick<AlertCondition, 'type' | 'edgeId' | 'linkId'>): string {
  return `${c.type}:${c.edgeId}:${c.linkId ?? '-'}`;
}

/** Breach severity grows with how far p95 sits above the threshold: 2x the limit is MAJOR. */
function breachSeverity(value: number, limit: number): AlertSeverity {
  return value >= limit * 2 ? 'MAJOR' : 'MINOR';
}

/**
 * Pure rule evaluation for one edge. Quality rules look at p95 rather than the mean so
 * short but repeated spikes (the ones users notice on calls) are caught, and are skipped
 * for links that are down - the LINK_DOWN alert already covers them.
 */
export function evaluateEdgeConditions(edge: Edge, samples: LinkSample[], sla: SlaThresholds = DEFAULT_SLA.REALTIME): AlertCondition[] {
  if (edge.status === 'DOWN') {
    return [{ type: 'EDGE_DOWN', edgeId: edge.id, severity: 'CRITICAL', message: `Edge ${edge.name} is offline` }];
  }
  const out: AlertCondition[] = [];
  const activeLinks = edge.links.filter((l) => l.state !== 'STANDBY');
  for (const link of activeLinks) {
    if (link.state === 'DOWN') {
      const lastActive = activeLinks.every((l) => l.id === link.id || l.state === 'DOWN');
      out.push({
        type: 'LINK_DOWN',
        edgeId: edge.id,
        linkId: link.id,
        severity: lastActive ? 'CRITICAL' : 'MAJOR',
        message: `${edge.name} link ${link.name} (${link.transport}) is down`,
      });
      continue;
    }
    const agg = aggregateLink(samples.filter((s) => s.linkId === link.id));
    if (!agg || agg.samples < MIN_SAMPLES) continue;
    const checks: Array<[AlertType, number, number, string]> = [
      ['HIGH_LATENCY', agg.latencyMs.p95, sla.maxLatencyMs, 'ms latency'],
      ['HIGH_JITTER', agg.jitterMs.p95, sla.maxJitterMs, 'ms jitter'],
      ['HIGH_LOSS', agg.lossPct.p95, sla.maxLossPct, '% loss'],
    ];
    for (const [type, value, limit, unit] of checks) {
      if (value > limit) {
        out.push({
          type,
          edgeId: edge.id,
          linkId: link.id,
          severity: breachSeverity(value, limit),
          message: `${edge.name} link ${link.name}: p95 ${value}${unit} exceeds ${limit}${unit}`,
        });
      }
    }
  }
  return out;
}

/**
 * Raises, de-duplicates and auto-resolves alerts. A condition seen again bumps the
 * existing alert's occurrence count (and escalates severity) instead of creating a new
 * one; an evaluated alert whose condition has cleared is resolved on the next pass.
 */
export class AlertService {
  constructor(
    private readonly repo: AlertRepository,
    private readonly inventory: InventoryService,
    private readonly metrics: MetricsStore,
    private readonly providers: ProviderRegistry,
    private readonly tenants: TenantDirectory,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
    private readonly evaluationWindowMs = 15 * 60_000,
  ) {}

  async evaluateAccount(accountId: string): Promise<{ raised: number; resolved: number }> {
    const edges = await this.inventory.listEdges(accountId);
    const nowMs = this.now().getTime();
    const from = new Date(nowMs - this.evaluationWindowMs).toISOString();
    const to = new Date(nowMs).toISOString();
    let raised = 0;
    let resolved = 0;
    for (const edge of edges) {
      const conditions = evaluateEdgeConditions(edge, this.metrics.queryEdge(edge.id, from, to));
      const r = await this.reconcileEdge(accountId, edge.id, conditions);
      raised += r.raised;
      resolved += r.resolved;
    }
    if (raised || resolved) this.logger.info('alerts evaluated', { accountId, raised, resolved });
    return { raised, resolved };
  }

  async reconcileEdge(accountId: string, edgeId: string, conditions: AlertCondition[]): Promise<{ raised: number; resolved: number }> {
    const at = this.now().toISOString();
    const active = new Set<string>();
    let raised = 0;
    for (const c of conditions) {
      const fingerprint = fingerprintOf(c);
      active.add(fingerprint);
      const existing = await this.repo.findOpenByFingerprint(fingerprint);
      if (existing) {
        existing.occurrences += 1;
        existing.lastSeenAt = at;
        existing.message = c.message;
        if (SEVERITY_RANK[c.severity] > SEVERITY_RANK[existing.severity]) existing.severity = c.severity;
        await this.repo.update(existing);
        continue;
      }
      await this.repo.insert({
        id: `ALR-${randomUUID()}`,
        accountId,
        edgeId: c.edgeId,
        linkId: c.linkId,
        type: c.type,
        severity: c.severity,
        status: 'OPEN',
        message: c.message,
        fingerprint,
        occurrences: 1,
        raisedAt: at,
        lastSeenAt: at,
      });
      raised++;
    }

    const stale = await this.repo.find(
      (a) => a.accountId === accountId && a.edgeId === edgeId && a.status !== 'RESOLVED' && EVALUATED_TYPES.has(a.type) && !active.has(a.fingerprint),
    );
    for (const a of stale) await this.repo.update({ ...a, status: 'RESOLVED', resolvedAt: at });
    return { raised, resolved: stale.length };
  }

  async list(accountId: string, filter: AlertFilter): Promise<Page<Alert>> {
    return this.repo.page(
      (a) =>
        a.accountId === accountId &&
        (!filter.status || a.status === filter.status) &&
        (!filter.severity || a.severity === filter.severity) &&
        (!filter.edgeId || a.edgeId === filter.edgeId),
      filter,
      (a, b) =>
        Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.lastSeenAt.localeCompare(a.lastSeenAt),
    );
  }

  async acknowledge(principal: Principal, accountId: string, id: string): Promise<Alert> {
    const alert = await this.repo.get(id);
    if (!alert || alert.accountId !== accountId) throw new NotFoundProblem('Alert', id);
    if (alert.status !== 'OPEN') throw new ConflictProblem(`Alert is already ${alert.status}`, { status: alert.status });
    return this.repo.update({ ...alert, status: 'ACKNOWLEDGED', acknowledgedBy: principal.userId, acknowledgedAt: this.now().toISOString() });
  }

  /** Vendor events for the account, newest first. A controller outage drops its events rather than failing the call. */
  async events(accountId: string, range: { from: string; to: string }, filter: { edgeId?: string; limit: number }): Promise<{ items: SdwanEvent[]; unavailable: Vendor[] }> {
    const mappings = this.tenants.tenantsFor(accountId);
    const results = await Promise.allSettled(
      mappings.map((m) => this.providers.get(m.vendor).listEvents({ accountId, tenant: m.tenant }, range)),
    );
    const items: SdwanEvent[] = [];
    const unavailable = new Set<Vendor>();
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') items.push(...r.value);
      else {
        unavailable.add(mappings[i].vendor);
        this.logger.warn('event fetch failed', { accountId, vendor: mappings[i].vendor, err: r.reason });
      }
    });
    return {
      items: items
        .filter((e) => !filter.edgeId || e.edgeId === filter.edgeId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, filter.limit),
      unavailable: [...unavailable],
    };
  }
}
