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
        // Normalise the edge -> site link using the discovered site membership.
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
