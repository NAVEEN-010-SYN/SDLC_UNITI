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
