import type { Edge } from '../domain/types';
import type { Logger } from '../logging/logger';
import type { TenantDirectory } from '../repositories';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { AlertService } from '../services/AlertService';
import type { ChangeRequestService } from '../services/ChangeRequestService';
import type { InventoryService } from '../services/InventoryService';

/** First poll for an edge looks back this far; later polls continue from the newest stored sample. */
const INITIAL_LOOKBACK_MS = 60 * 60_000;

/** Bounds concurrent controller calls so a large account does not burst the VCO/FortiManager API. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

export interface PollResult {
  edges: number;
  samples: number;
  failures: number;
}

export async function pollMetrics(
  deps: { tenants: TenantDirectory; inventory: InventoryService; metrics: MetricsStore; logger: Logger },
  now: () => Date = () => new Date(),
  concurrency = 4,
): Promise<PollResult> {
  const result: PollResult = { edges: 0, samples: 0, failures: 0 };
  for (const accountId of deps.tenants.accounts()) {
    let edges: Edge[];
    try {
      edges = await deps.inventory.listEdges(accountId);
    } catch (err) {
      deps.logger.warn('metrics poll: inventory unavailable', { accountId, err });
      result.failures++;
      continue;
    }
    const to = now().toISOString();
    await mapLimit(edges.filter((e) => e.status !== 'DOWN'), concurrency, async (edge) => {
      const last = deps.metrics.lastTimestampForEdge(edge.id);
      const from = last ?? new Date(Date.parse(to) - INITIAL_LOOKBACK_MS).toISOString();
      try {
        const { provider, ctx } = await deps.inventory.resolveEdge(accountId, edge.id);
        result.samples += deps.metrics.append(await provider.getLinkMetrics(ctx, edge.vendorRef.id, { from, to }));
        result.edges++;
      } catch (err) {
        result.failures++;
        deps.logger.warn('metrics poll failed for edge', { accountId, edgeId: edge.id, err });
      }
    });
  }
  deps.logger.info('metrics poll complete', { ...result });
  return result;
}

export async function evaluateAlerts(deps: { tenants: TenantDirectory; alerts: AlertService; logger: Logger }): Promise<void> {
  for (const accountId of deps.tenants.accounts()) {
    try {
      await deps.alerts.evaluateAccount(accountId);
    } catch (err) {
      deps.logger.warn('alert evaluation failed', { accountId, err });
    }
  }
}

export async function executeDueChanges(deps: { changes: ChangeRequestService; logger: Logger }): Promise<void> {
  const done = await deps.changes.executeDue();
  if (done.length) deps.logger.info('change executor run', { executed: done.map((c) => ({ id: c.id, status: c.status })) });
}
