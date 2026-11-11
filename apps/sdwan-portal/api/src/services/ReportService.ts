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
  /** A site is available when at least one of its links is - the point of SD-WAN. */
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
