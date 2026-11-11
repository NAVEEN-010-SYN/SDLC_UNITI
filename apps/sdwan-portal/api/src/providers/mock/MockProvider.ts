import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent, Vendor, WanLink } from '../../domain/types';
import { NotFoundProblem } from '../../errors/problem';
import type { ApplyResult, ConfigSnapshot, DiscoveredSite, ProviderContext, SdwanProvider, TimeRange } from '../SdwanProvider';

/** Deterministic 32-bit hash -> [0,1). Same input always produces the same metric. */
function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

interface MockSiteDef {
  key: string;
  name: string;
  city: string;
  postcode: string;
  edges: Array<{ key: string; model: string; ha: boolean; links: Array<Pick<WanLink, 'interface' | 'transport' | 'ispName' | 'bandwidthDownKbps' | 'bandwidthUpKbps'>> }>;
}

const SITES: MockSiteDef[] = [
  {
    key: 'hq',
    name: 'Head Office',
    city: 'Leeds',
    postcode: 'LS1 4AP',
    edges: [
      {
        key: 'hq-edge-1',
        model: 'edge840',
        ha: true,
        links: [
          { interface: 'GE3', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 1_000_000, bandwidthUpKbps: 1_000_000 },
          { interface: 'GE4', transport: 'BROADBAND', ispName: 'Openreach FTTC', bandwidthDownKbps: 80_000, bandwidthUpKbps: 20_000 },
        ],
      },
    ],
  },
  {
    key: 'branch-north',
    name: 'Branch \u2013 York',
    city: 'York',
    postcode: 'YO1 7HH',
    edges: [
      {
        key: 'york-edge-1',
        model: 'edge610',
        ha: false,
        links: [
          { interface: 'GE1', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 500_000, bandwidthUpKbps: 500_000 },
          { interface: 'CELL1', transport: 'LTE', ispName: 'EE', bandwidthDownKbps: 50_000, bandwidthUpKbps: 15_000 },
        ],
      },
    ],
  },
  {
    key: 'branch-south',
    name: 'Branch \u2013 Sheffield',
    city: 'Sheffield',
    postcode: 'S1 2HE',
    edges: [
      {
        key: 'sheff-edge-1',
        model: 'edge510',
        ha: false,
        links: [{ interface: 'GE1', transport: 'FIBRE', ispName: 'Uniti', bandwidthDownKbps: 300_000, bandwidthUpKbps: 300_000 }],
      },
    ],
  },
];

/**
 * In-memory provider used in development (`SDWAN_PROVIDER_MODE=mock`) and in route
 * tests. Policies and firewall rules are stored per edge so apply/list round-trips
 * behave like a real controller.
 */
export class MockProvider implements SdwanProvider {
  private readonly policies = new Map<string, BusinessPolicy[]>();
  private readonly firewall = new Map<string, FirewallRule[]>();
  private readonly versions = new Map<string, string>();
  readonly calls: Array<{ method: string; edge?: string }> = [];

  constructor(readonly vendor: Vendor) {}

  private prefix(ctx: ProviderContext): string {
    return `${this.vendor === 'VELOCLOUD' ? 'vc' : 'ft'}-${ctx.tenant}`;
  }

  private findEdgeDef(edgeVendorId: string) {
    for (const s of SITES) {
      const e = s.edges.find((x) => x.key === edgeVendorId);
      if (e) return { site: s, edge: e };
    }
    throw new NotFoundProblem('Edge', edgeVendorId);
  }

  async listSites(): Promise<DiscoveredSite[]> {
    return SITES.map((s) => ({
      vendorId: s.key,
      name: s.name,
      address: { line1: `1 ${s.name} Street`, city: s.city, postcode: s.postcode, country: 'GB' },
      edgeVendorIds: s.edges.map((e) => e.key),
    }));
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    return SITES.flatMap((s) => s.edges.map((e) => this.buildEdge(ctx, s, e)));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const { site, edge } = this.findEdgeDef(edgeVendorId);
    return this.buildEdge(ctx, site, edge);
  }

  private buildEdge(ctx: ProviderContext, site: MockSiteDef, def: MockSiteDef['edges'][number]): Edge {
    const id = `${this.prefix(ctx)}-${def.key}`;
    const lteDown = def.key === 'york-edge-1' && hashUnit(`${id}:${new Date().toISOString().slice(0, 13)}`) < 0.2;
    return {
      id,
      siteId: `${this.prefix(ctx)}-site-${site.key}`,
      accountId: ctx.accountId,
      vendor: this.vendor,
      vendorRef: { vendor: this.vendor, tenant: ctx.tenant, id: def.key },
      name: def.key,
      model: this.vendor === 'VELOCLOUD' ? def.model : def.model.replace('edge', 'FGT-'),
      serialNumber: `SN${Math.floor(hashUnit(id) * 1e8)}`,
      softwareVersion: this.versions.get(id) ?? (this.vendor === 'VELOCLOUD' ? '5.2.1' : '7.2.8'),
      status: lteDown ? 'DEGRADED' : 'UP',
      haState: def.ha ? 'ACTIVE' : 'STANDALONE',
      lastContact: new Date().toISOString(),
      links: def.links.map((l) => ({
        ...l,
        id: `${id}:${l.interface}`,
        edgeId: id,
        name: l.interface,
        state: lteDown && l.transport === 'LTE' ? 'DOWN' : 'UP',
      })),
    };
  }

  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const step = 5 * 60_000;
    const from = Math.ceil(Date.parse(range.from) / step) * step;
    const to = Date.parse(range.to);
    const out: LinkSample[] = [];
    for (const link of edge.links) {
      let baseLatency = 55;
      if (link.transport === 'FIBRE') baseLatency = 8;
      else if (link.transport === 'BROADBAND') baseLatency = 22;
      for (let t = from; t <= to; t += step) {
        const r = hashUnit(`${link.id}:${t}`);
        const spike = r > 0.97;
        let lossPct = 0;
        if (spike) lossPct = Math.round(r * 300) / 100;
        else if (r > 0.9) lossPct = 0.2;
        out.push({
          edgeId: edge.id,
          linkId: link.id,
          timestamp: new Date(t).toISOString(),
          latencyMs: Math.round((baseLatency * (1 + r * 0.6) + (spike ? 180 : 0)) * 10) / 10,
          jitterMs: Math.round((baseLatency * 0.1 + r * 4 + (spike ? 35 : 0)) * 10) / 10,
          lossPct,
          rxBps: Math.round(link.bandwidthDownKbps * 1000 * (0.15 + 0.5 * hashUnit(`${link.id}:rx:${t}`))),
          txBps: Math.round(link.bandwidthUpKbps * 1000 * (0.1 + 0.4 * hashUnit(`${link.id}:tx:${t}`))),
        });
      }
    }
    return out;
  }

  async listBusinessPolicies(_ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    this.findEdgeDef(edgeVendorId);
    return structuredClone(this.policies.get(edgeVendorId) ?? []);
  }

  async applyBusinessPolicies(_ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    this.findEdgeDef(edgeVendorId);
    this.calls.push({ method: 'applyBusinessPolicies', edge: edgeVendorId });
    this.policies.set(edgeVendorId, structuredClone(policies));
    return { applied: policies.length, warnings: [] };
  }

  async listFirewallRules(_ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    this.findEdgeDef(edgeVendorId);
    return structuredClone(this.firewall.get(edgeVendorId) ?? []);
  }

  async applyFirewallRules(_ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    this.findEdgeDef(edgeVendorId);
    this.calls.push({ method: 'applyFirewallRules', edge: edgeVendorId });
    this.firewall.set(edgeVendorId, structuredClone(rules));
    return { applied: rules.length, warnings: [] };
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    return {
      content: {
        format: 'mock',
        policies: this.policies.get(edgeVendorId) ?? [],
        firewall: this.firewall.get(edgeVendorId) ?? [],
      },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(_ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    this.calls.push({ method: 'restoreConfig', edge: edgeVendorId });
    this.policies.set(edgeVendorId, structuredClone((snapshot.content.policies as BusinessPolicy[]) ?? []));
    this.firewall.set(edgeVendorId, structuredClone((snapshot.content.firewall as FirewallRule[]) ?? []));
    return { applied: 2, warnings: [] };
  }

  async rebootEdge(_ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    this.calls.push({ method: 'rebootEdge', edge: edgeVendorId });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    this.calls.push({ method: 'upgradeEdge', edge: edgeVendorId });
    this.versions.set(`${this.prefix(ctx)}-${edgeVendorId}`, targetVersion);
    return { applied: 1, warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const edges = await this.listEdges(ctx);
    const hour = 3_600_000;
    const out: SdwanEvent[] = [];
    for (let t = Math.ceil(Date.parse(range.from) / hour) * hour; t <= Date.parse(range.to); t += hour) {
      for (const e of edges) {
        const r = hashUnit(`${e.id}:ev:${t}`);
        if (r < 0.92) continue;
        out.push({
          id: `${e.id}-ev-${t}`,
          accountId: ctx.accountId,
          edgeId: e.id,
          vendor: this.vendor,
          occurredAt: new Date(t).toISOString(),
          category: r > 0.98 ? 'EDGE' : 'LINK',
          severity: r > 0.98 ? 'MAJOR' : 'MINOR',
          message: r > 0.98 ? `${e.name} HA heartbeat lost for 12s` : `${e.links[0].name} path quality degraded`,
        });
      }
    }
    return out;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
