import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent } from '../../domain/types';
import { NotFoundProblem, UpstreamProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import type {
  ApplyResult,
  ConfigSnapshot,
  DiscoveredSite,
  ProviderContext,
  SdwanProvider,
  TimeRange,
} from '../SdwanProvider';
import { VeloCloudClient } from './VeloCloudClient';
import {
  firewallFromVco,
  firewallToVco,
  mapEdge,
  mapEvent,
  mapLinkSeries,
  policiesFromVco,
  policiesToVco,
} from './velocloudMappers';
import type {
  VcoConfigModule,
  VcoConfigProfile,
  VcoEdge,
  VcoEvent,
  VcoFirewallModuleData,
  VcoLinkSeries,
  VcoQosModuleData,
} from './velocloudTypes';

const LINK_METRICS = ['bestLatencyMsRx', 'bestJitterMsRx', 'bestLossPctRx', 'bytesRx', 'bytesTx'] as const;
/** Only the global segment is customer-managed in the managed service. */
const GLOBAL_SEGMENT_ID = 0;

function siteAddress(e: VcoEdge): DiscoveredSite['address'] {
  if (!e.site) return undefined;
  return {
    line1: e.site.streetAddress ?? '',
    city: e.site.city ?? '',
    postcode: e.site.postalCode ?? '',
    country: e.site.country ?? 'GB',
  };
}

export class VeloCloudAdapter implements SdwanProvider {
  readonly vendor = 'VELOCLOUD' as const;

  constructor(
    private readonly client: VeloCloudClient,
    private readonly logger: Logger,
  ) {}

  private enterpriseId(ctx: ProviderContext): number {
    const id = Number(ctx.tenant);
    if (!Number.isInteger(id) || id <= 0) throw new UpstreamProblem('VELOCLOUD', `invalid enterpriseId "${ctx.tenant}"`);
    return id;
  }

  private async fetchEdges(ctx: ProviderContext): Promise<VcoEdge[]> {
    return this.client.call<VcoEdge[]>('enterprise/getEnterpriseEdges', {
      enterpriseId: this.enterpriseId(ctx),
      with: ['site', 'links', 'ha'],
    });
  }

  async listSites(ctx: ProviderContext): Promise<DiscoveredSite[]> {
    const edges = await this.fetchEdges(ctx);
    const sites = new Map<number, DiscoveredSite>();
    for (const e of edges) {
      const existing = sites.get(e.siteId);
      if (existing) {
        existing.edgeVendorIds.push(String(e.id));
        continue;
      }
      sites.set(e.siteId, {
        vendorId: String(e.siteId),
        name: e.site?.name ?? e.name,
        address: siteAddress(e),
        edgeVendorIds: [String(e.id)],
      });
    }
    return [...sites.values()];
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    const edges = await this.fetchEdges(ctx);
    return edges.map((e) => mapEdge(ctx.tenant, ctx.accountId, `vc-site-${ctx.tenant}-${e.siteId}`, e));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const edge = await this.client.call<VcoEdge | null>('edge/getEdge', {
      enterpriseId: this.enterpriseId(ctx),
      id: Number(edgeVendorId),
      with: ['site', 'links', 'ha'],
    });
    if (!edge) throw new NotFoundProblem('Edge', edgeVendorId);
    return mapEdge(ctx.tenant, ctx.accountId, `vc-site-${ctx.tenant}-${edge.siteId}`, edge);
  }

  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const series = await this.client.call<VcoLinkSeries[]>('metrics/getEdgeLinkSeries', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
      interval: { start: Date.parse(range.from), end: Date.parse(range.to) },
      metrics: LINK_METRICS,
    });
    return mapLinkSeries(edge.id, series ?? []);
  }

  private async configStack(ctx: ProviderContext, edgeVendorId: string): Promise<VcoConfigProfile[]> {
    const stack = await this.client.call<VcoConfigProfile[]>('edge/getEdgeConfigurationStack', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
    });
    if (!stack?.length) throw new UpstreamProblem('VELOCLOUD', `edge ${edgeVendorId} returned an empty configuration stack`);
    return stack;
  }

  /**
   * The effective module is the edge-specific override (stack[0]) when present, else the
   * profile's (stack[1]). Writes always go to the edge-specific profile so one customer
   * site never changes a shared profile.
   */
  private effectiveModule(stack: VcoConfigProfile[], name: VcoConfigModule['name']): VcoConfigModule | undefined {
    return stack[0].modules.find((m) => m.name === name) ?? stack[1]?.modules.find((m) => m.name === name);
  }

  private edgeModule(stack: VcoConfigProfile[], name: VcoConfigModule['name'], edgeVendorId: string): VcoConfigModule {
    const mod = stack[0].modules.find((m) => m.name === name);
    if (!mod) {
      throw new UpstreamProblem(
        'VELOCLOUD',
        `edge ${edgeVendorId} has no edge-specific ${name} module; enable edge override in VCO first`,
      );
    }
    return mod;
  }

  async listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const data = this.effectiveModule(stack, 'QOS')?.data as VcoQosModuleData | undefined;
    const segment = data?.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    return policiesFromVco(segment?.rules ?? []);
  }

  async applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const mod = this.edgeModule(stack, 'QOS', edgeVendorId);
    const data = structuredClone(mod.data) as unknown as VcoQosModuleData;
    const rules = policiesToVco(policies);
    const segment = data.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    if (segment) segment.rules = rules;
    else data.segments.push({ segment: { segmentId: GLOBAL_SEGMENT_ID, name: 'Global Segment' }, rules });
    await this.updateModule(ctx, mod.id, data as unknown as Record<string, unknown>);
    const warnings = rules.length > policies.length ? [`${policies.length} policies expanded into ${rules.length} VCO rules`] : [];
    return { applied: rules.length, warnings };
  }

  async listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const data = this.effectiveModule(stack, 'firewall')?.data as VcoFirewallModuleData | undefined;
    const segment = data?.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    return firewallFromVco(segment?.outbound ?? []);
  }

  async applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    const stack = await this.configStack(ctx, edgeVendorId);
    const mod = this.edgeModule(stack, 'firewall', edgeVendorId);
    const data = structuredClone(mod.data) as unknown as VcoFirewallModuleData;
    const vcoRules = firewallToVco(rules);
    const segment = data.segments.find((s) => s.segment.segmentId === GLOBAL_SEGMENT_ID);
    if (segment) segment.outbound = vcoRules;
    else data.segments.push({ segment: { segmentId: GLOBAL_SEGMENT_ID, name: 'Global Segment' }, outbound: vcoRules });
    data.firewall_enabled = true;
    await this.updateModule(ctx, mod.id, data as unknown as Record<string, unknown>);
    return { applied: vcoRules.length, warnings: [] };
  }

  private async updateModule(ctx: ProviderContext, moduleId: number, data: Record<string, unknown>): Promise<void> {
    const res = await this.client.call<{ rows: number }>('configuration/updateConfigurationModule', {
      enterpriseId: this.enterpriseId(ctx),
      configurationModuleId: moduleId,
      _update: { data },
    });
    if (!res || res.rows < 1) {
      throw new UpstreamProblem('VELOCLOUD', `configuration module ${moduleId} update affected no rows`);
    }
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const [stack, edge] = await Promise.all([this.configStack(ctx, edgeVendorId), this.getEdge(ctx, edgeVendorId)]);
    const edgeProfile = stack[0];
    return {
      content: {
        format: 'vco-edge-profile',
        profileId: edgeProfile.id,
        modules: edgeProfile.modules.map((m) => ({ id: m.id, name: m.name, version: m.version, data: m.data })),
      },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    if (snapshot.content.format !== 'vco-edge-profile') {
      throw new UpstreamProblem('VELOCLOUD', 'snapshot is not a VeloCloud edge profile backup');
    }
    const stack = await this.configStack(ctx, edgeVendorId);
    const current = new Map(stack[0].modules.map((m) => [m.name, m]));
    const saved = snapshot.content.modules as Array<Pick<VcoConfigModule, 'name' | 'data'>>;
    const warnings: string[] = [];
    let applied = 0;
    for (const mod of saved) {
      const target = current.get(mod.name);
      if (!target) {
        warnings.push(`module ${mod.name} no longer exists on the edge profile; skipped`);
        continue;
      }
      await this.updateModule(ctx, target.id, mod.data);
      applied++;
    }
    this.logger.info('vco config restored', { edgeVendorId, applied, skipped: warnings.length });
    return { applied, warnings };
  }

  async rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    await this.client.call('edge/rebootEdge', { enterpriseId: this.enterpriseId(ctx), edgeId: Number(edgeVendorId) });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    const res = await this.client.call<{ taskId?: string }>('edge/updateEdgeSoftwareImage', {
      enterpriseId: this.enterpriseId(ctx),
      edgeId: Number(edgeVendorId),
      softwareVersion: targetVersion,
    });
    return { applied: 1, taskId: res?.taskId, warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const [res, edges] = await Promise.all([
      this.client.call<{ data: VcoEvent[] }>('event/getEnterpriseEvents', {
        enterpriseId: this.enterpriseId(ctx),
        interval: { start: Date.parse(range.from), end: Date.parse(range.to) },
      }),
      this.fetchEdges(ctx),
    ]);
    const byName = new Map(edges.map((e) => [e.name, `vc-${ctx.tenant}-${e.logicalId}`]));
    return (res?.data ?? []).map((ev) => mapEvent(ctx.tenant, ctx.accountId, ev, byName));
  }

  async ping(): Promise<boolean> {
    try {
      if (!this.client.hasSession) await this.client.login();
      return true;
    } catch (err) {
      this.logger.warn('vco ping failed', { err });
      return false;
    }
  }
}
