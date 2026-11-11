import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent } from '../../domain/types';
import { NotFoundProblem, UpstreamProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import { sleep } from '../http/backoff';
import type { ApplyResult, ConfigSnapshot, DiscoveredSite, ProviderContext, SdwanProvider, TimeRange } from '../SdwanProvider';
import { FortiManagerClient } from './FortiManagerClient';
import {
  firewallFromForti,
  firewallToForti,
  mapDevice,
  mapEventLog,
  mapLinks,
  MemberInfo,
  OBJ_PREFIX,
  parseInterfaceDescription,
  policiesFromForti,
  policiesToForti,
  samplesFromMonitor,
} from './fortinetMappers';
import type {
  FgtAddress,
  FgtEventLog,
  FgtFirewallPolicy,
  FgtHealthCheck,
  FgtHealthCheckMonitor,
  FgtInterface,
  FgtSdwanMember,
  FgtSdwanService,
  FgtService,
  FmgDevice,
  FmgDeviceGroup,
} from './fortinetTypes';

export interface FortinetAdapterOptions {
  policyPackage: string;
  installTimeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

const DEVICE_FIELDS = ['name', 'sn', 'platform_str', 'os_ver', 'mr', 'patch', 'build', 'conn_status', 'ha_mode', 'ha_slave', 'last_checked', 'desc', 'meta fields'];

export class FortinetAdapter implements SdwanProvider {
  readonly vendor = 'FORTINET' as const;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(
    private readonly fmg: FortiManagerClient,
    private readonly logger: Logger,
    private readonly opts: FortinetAdapterOptions,
  ) {
    this.sleepImpl = opts.sleepImpl ?? sleep;
  }

  private devPath(device: string): string {
    return `/pm/config/device/${encodeURIComponent(device)}/vdom/root`;
  }

  private async devices(adom: string): Promise<FmgDevice[]> {
    return (await this.fmg.rpc<FmgDevice[]>('get', `/dvmdb/adom/${adom}/device`, undefined, { fields: DEVICE_FIELDS })) ?? [];
  }

  private async groups(adom: string): Promise<FmgDeviceGroup[]> {
    return (await this.fmg.rpc<FmgDeviceGroup[]>('get', `/dvmdb/adom/${adom}/group`)) ?? [];
  }

  /** Maps device name → owning site (device group). Devices outside any group become their own site. */
  private siteIndex(adom: string, groups: FmgDeviceGroup[]): Map<string, string> {
    const idx = new Map<string, string>();
    for (const g of groups) {
      if (g.name.startsWith('All_')) continue; // FortiManager built-in groups
      for (const m of g['object member'] ?? []) idx.set(m.name, `ft-site-${adom}-${g.name}`);
    }
    return idx;
  }

  async listSites(ctx: ProviderContext): Promise<DiscoveredSite[]> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const known = new Set(devices.map((d) => d.name));
    const sites: DiscoveredSite[] = [];
    const grouped = new Set<string>();
    for (const g of groups.filter((x) => !x.name.startsWith('All_'))) {
      const members = (g['object member'] ?? []).map((m) => m.name).filter((n) => known.has(n));
      if (members.length === 0) continue;
      members.forEach((m) => grouped.add(m));
      const meta = devices.find((d) => d.name === members[0])?.['meta fields'] ?? {};
      sites.push({
        vendorId: g.name,
        name: g.desc || g.name,
        address: meta.Address ? { line1: meta.Address, city: meta.City ?? '', postcode: meta.Postcode ?? '', country: meta.Country ?? 'GB' } : undefined,
        edgeVendorIds: members,
      });
    }
    for (const d of devices.filter((x) => !grouped.has(x.name))) {
      sites.push({ vendorId: d.name, name: d.desc || d.name, edgeVendorIds: [d.name] });
    }
    return sites;
  }

  private async sdwanMembers(device: string): Promise<FgtSdwanMember[]> {
    return (await this.fmg.rpc<FgtSdwanMember[]>('get', `${this.devPath(device)}/system/sdwan/members`)) ?? [];
  }

  private async wanInterfaces(device: string): Promise<FgtInterface[]> {
    const all = (await this.fmg.rpc<FgtInterface[]>('get', `/pm/config/device/${encodeURIComponent(device)}/global/system/interface`)) ?? [];
    return all.filter((i) => i.role === 'wan');
  }

  private async healthMonitor(adom: string, device: string): Promise<FgtHealthCheckMonitor | undefined> {
    try {
      return await this.fmg.proxy<FgtHealthCheckMonitor>(adom, device, 'get', '/api/v2/monitor/virtual-wan/health-check');
    } catch (err) {
      // An offline device cannot be proxied; inventory should still render with UNKNOWN links.
      this.logger.debug('health-check monitor unavailable', { device, err });
      return undefined;
    }
  }

  private async buildEdge(ctx: ProviderContext, d: FmgDevice, siteId: string): Promise<Edge> {
    const online = d.conn_status === 1;
    const [members, interfaces, monitor] = await Promise.all([
      this.sdwanMembers(d.name),
      this.wanInterfaces(d.name),
      online ? this.healthMonitor(ctx.tenant, d.name) : Promise.resolve(undefined),
    ]);
    const edgeId = `ft-${ctx.tenant}-${d.name}`;
    return mapDevice(ctx.tenant, ctx.accountId, siteId, d, mapLinks(edgeId, members, interfaces, monitor));
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const idx = this.siteIndex(ctx.tenant, groups);
    return Promise.all(devices.map((d) => this.buildEdge(ctx, d, idx.get(d.name) ?? `ft-site-${ctx.tenant}-${d.name}`)));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const device = devices.find((d) => d.name === edgeVendorId);
    if (!device) throw new NotFoundProblem('Edge', edgeVendorId);
    const idx = this.siteIndex(ctx.tenant, groups);
    return this.buildEdge(ctx, device, idx.get(device.name) ?? `ft-site-${ctx.tenant}-${device.name}`);
  }

  /**
   * Returns the current health-check reading as a single sample per link. Historical
   * ranges are served from the portal's own metrics store, which the poller fills.
   */
  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const now = new Date().toISOString();
    if (now < range.from || now > range.to) return [];
    const monitor = await this.healthMonitor(ctx.tenant, edgeVendorId);
    if (!monitor) return [];
    return samplesFromMonitor(`ft-${ctx.tenant}-${edgeVendorId}`, monitor, now);
  }

  private async memberInfo(device: string): Promise<MemberInfo[]> {
    const [members, interfaces] = await Promise.all([this.sdwanMembers(device), this.wanInterfaces(device)]);
    const ifMap = new Map(interfaces.map((i) => [i.name, i]));
    return members
      .filter((m) => m.status === 'enable')
      .map((m) => ({ seq: m['seq-num'], transport: parseInterfaceDescription(ifMap.get(m.interface)?.description).transport }));
  }

  private async adomAddresses(adom: string): Promise<FgtAddress[]> {
    return (await this.fmg.rpc<FgtAddress[]>('get', `/pm/config/adom/${adom}/obj/firewall/address`)) ?? [];
  }

  async listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    const base = this.devPath(edgeVendorId);
    const [services, healthChecks, addresses, members] = await Promise.all([
      this.fmg.rpc<FgtSdwanService[]>('get', `${base}/system/sdwan/service`),
      this.fmg.rpc<FgtHealthCheck[]>('get', `${base}/system/sdwan/health-check`),
      this.adomAddresses(ctx.tenant),
      this.memberInfo(edgeVendorId),
    ]);
    return policiesFromForti(services ?? [], healthChecks ?? [], addresses, members);
  }

  /**
   * Writes address objects, health checks and SD-WAN rules to the device database in
   * FortiManager, then installs the device settings. Address objects are upserted
   * ("set") so re-applying the same policy set is idempotent.
   */
  async applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    const base = this.devPath(edgeVendorId);
    const members = await this.memberInfo(edgeVendorId);
    if (members.length === 0) throw new UpstreamProblem('FORTINET', `device ${edgeVendorId} has no enabled SD-WAN members`);
    const bundle = policiesToForti(policies, members);

    if (bundle.addresses.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/address`, bundle.addresses);
    const existingHc = (await this.fmg.rpc<FgtHealthCheck[]>('get', `${base}/system/sdwan/health-check`)) ?? [];
    const managedHc = existingHc.filter((h) => h.name.startsWith(OBJ_PREFIX) && !bundle.healthChecks.some((n) => n.name === h.name));
    await this.fmg.rpc('set', `${base}/system/sdwan/health-check`, bundle.healthChecks);
    // Rules must be replaced before stale health checks are deleted (they may still be referenced).
    await this.fmg.rpc('replace', `${base}/system/sdwan/service`, bundle.services);
    for (const hc of managedHc) {
      await this.fmg.rpc('delete', `${base}/system/sdwan/health-check/${encodeURIComponent(hc.name)}`);
    }
    const taskId = await this.installDevice(ctx.tenant, edgeVendorId);
    return {
      taskId: String(taskId),
      applied: bundle.services.length,
      warnings: bundle.services.length > policies.length ? [`${policies.length} policies expanded into ${bundle.services.length} SD-WAN rules`] : [],
    };
  }

  private pkgPath(adom: string): string {
    return `/pm/config/adom/${adom}/pkg/${encodeURIComponent(this.opts.policyPackage)}/firewall/policy`;
  }

  async listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    const [policies, addresses, services] = await Promise.all([
      this.fmg.rpc<FgtFirewallPolicy[]>('get', this.pkgPath(ctx.tenant), undefined, {
        filter: ['scope member', 'contain', { name: edgeVendorId, vdom: 'root' }],
      }),
      this.adomAddresses(ctx.tenant),
      this.fmg.rpc<FgtService[]>('get', `/pm/config/adom/${ctx.tenant}/obj/firewall/service/custom`),
    ]);
    const managed = (policies ?? []).filter((p) => p.comments?.startsWith('uniti:') || p.policyid >= 1000);
    return firewallFromForti(managed, addresses, services ?? []);
  }

  async applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    const bundle = firewallToForti(rules);
    if (bundle.addresses.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/address`, bundle.addresses);
    if (bundle.services.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/service/custom`, bundle.services);

    const existing = (await this.fmg.rpc<FgtFirewallPolicy[]>('get', this.pkgPath(ctx.tenant))) ?? [];
    for (const p of existing.filter((x) => x.policyid >= 1000)) {
      await this.fmg.rpc('delete', `${this.pkgPath(ctx.tenant)}/${p.policyid}`);
    }
    if (bundle.policies.length) await this.fmg.rpc('add', this.pkgPath(ctx.tenant), bundle.policies);
    const taskId = await this.installPackage(ctx.tenant, edgeVendorId);
    return { taskId: String(taskId), applied: bundle.policies.length, warnings: [] };
  }

  private async installPackage(adom: string, device: string): Promise<number> {
    const res = await this.fmg.rpc<{ task: number }>('exec', '/securityconsole/install/package', {
      adom,
      pkg: this.opts.policyPackage,
      scope: [{ name: device, vdom: 'root' }],
      flags: ['none'],
    });
    await this.fmg.waitForTask(res.task, { timeoutMs: this.opts.installTimeoutMs ?? 300_000, pollMs: 3000, sleep: this.sleepImpl });
    return res.task;
  }

  private async installDevice(adom: string, device: string): Promise<number> {
    const res = await this.fmg.rpc<{ task: number }>('exec', '/securityconsole/install/device', {
      adom,
      scope: [{ name: device, vdom: 'root' }],
      flags: ['none'],
    });
    await this.fmg.waitForTask(res.task, { timeoutMs: this.opts.installTimeoutMs ?? 300_000, pollMs: 3000, sleep: this.sleepImpl });
    return res.task;
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const text = await this.fmg.proxy<string>(ctx.tenant, edgeVendorId, 'get', '/api/v2/monitor/system/config/backup?scope=global');
    if (typeof text !== 'string' || !text.includes('config system global')) {
      throw new UpstreamProblem('FORTINET', `backup of ${edgeVendorId} did not return a FortiOS configuration`);
    }
    return {
      content: { format: 'fortios-cli', lines: text.split('\n').length, text },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    if (snapshot.content.format !== 'fortios-cli' || typeof snapshot.content.text !== 'string') {
      throw new UpstreamProblem('FORTINET', 'snapshot is not a FortiOS configuration backup');
    }
    const edge = await this.getEdge(ctx, edgeVendorId);
    const [major, minor] = edge.softwareVersion.split('.');
    const [sMajor, sMinor] = snapshot.vendorVersion.split('.');
    if (major !== sMajor || minor !== sMinor) {
      throw new UpstreamProblem(
        'FORTINET',
        `backup was taken on FortiOS ${snapshot.vendorVersion}; device runs ${edge.softwareVersion}. Cross-version restore is not supported`,
      );
    }
    await this.fmg.proxy(ctx.tenant, edgeVendorId, 'post', '/api/v2/monitor/system/config/restore', {
      source: 'upload',
      scope: 'global',
      file_content: Buffer.from(snapshot.content.text).toString('base64'),
    });
    // The device reboots after restore; FortiManager must re-sync its device database.
    await this.fmg.rpc('exec', '/dvm/cmd/reload/dev-list', { adom: ctx.tenant, 'reload-dev-member-list': [{ name: edgeVendorId, vdom: 'root' }] });
    return { applied: 1, warnings: ['device reboots to apply the restored configuration'] };
  }

  async rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    await this.fmg.proxy(ctx.tenant, edgeVendorId, 'post', '/api/v2/monitor/system/os/reboot', { event_log_message: 'Reboot requested via Uniti self-care' });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    const [major, minor, patch] = targetVersion.split('.').map(Number);
    if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
      throw new UpstreamProblem('FORTINET', `invalid FortiOS version "${targetVersion}"`);
    }
    const res = await this.fmg.rpc<{ taskid: number }>('exec', '/um/image/upgrade', {
      adom: ctx.tenant,
      device: [{ name: edgeVendorId }],
      image: { release: `${major}.${minor}.${patch}` },
      flags: 'f_boot_alt_partition',
    });
    return { applied: 1, taskId: String(res.taskid), warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const devices = (await this.devices(ctx.tenant)).filter((d) => d.conn_status === 1);
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    const perDevice = await Promise.all(
      devices.map(async (d) => {
        try {
          const logs = await this.fmg.proxy<FgtEventLog[]>(ctx.tenant, d.name, 'get', '/api/v2/log/memory/event/system?rows=500');
          return (logs ?? []).map((l) => mapEventLog(ctx.tenant, ctx.accountId, d.name, l));
        } catch (err) {
          this.logger.warn('event fetch failed for device', { device: d.name, err });
          return [];
        }
      }),
    );
    return perDevice
      .flat()
      .filter((e) => {
        const t = Date.parse(e.occurredAt);
        return t >= from && t <= to;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async ping(): Promise<boolean> {
    try {
      await this.fmg.rpc('get', '/sys/status');
      return true;
    } catch (err) {
      this.logger.warn('fortimanager ping failed', { err });
      return false;
    }
  }
}
