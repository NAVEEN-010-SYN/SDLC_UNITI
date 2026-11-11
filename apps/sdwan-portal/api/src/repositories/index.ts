import type { Alert, ChangeRequest, ConfigBackup, MaintenanceWindow, Vendor } from '../domain/types';
import { InMemoryRepository } from './InMemoryRepository';
import { MetricsStore } from './MetricsStore';

export class ChangeRequestRepository extends InMemoryRepository<ChangeRequest> {}
export class BackupRepository extends InMemoryRepository<ConfigBackup> {}
export class MaintenanceWindowRepository extends InMemoryRepository<MaintenanceWindow> {}

export class AlertRepository extends InMemoryRepository<Alert> {
  async findOpenByFingerprint(fingerprint: string): Promise<Alert | undefined> {
    const [hit] = await this.find((a) => a.fingerprint === fingerprint && a.status !== 'RESOLVED');
    return hit;
  }
}

/** Links a portal Account to the tenants that hold its SD-WAN estate in each controller. */
export interface AccountTenant {
  accountId: string;
  vendor: Vendor;
  /** VeloCloud enterpriseId or FortiManager ADOM. */
  tenant: string;
}

export class TenantDirectory {
  private readonly byAccount = new Map<string, AccountTenant[]>();

  constructor(entries: AccountTenant[] = []) {
    for (const e of entries) this.add(e);
  }

  add(entry: AccountTenant): void {
    const list = this.byAccount.get(entry.accountId) ?? [];
    if (!list.some((t) => t.vendor === entry.vendor && t.tenant === entry.tenant)) list.push(entry);
    this.byAccount.set(entry.accountId, list);
  }

  tenantsFor(accountId: string): AccountTenant[] {
    return this.byAccount.get(accountId) ?? [];
  }

  accounts(): string[] {
    return [...this.byAccount.keys()];
  }
}

export interface Repositories {
  changeRequests: ChangeRequestRepository;
  backups: BackupRepository;
  maintenanceWindows: MaintenanceWindowRepository;
  alerts: AlertRepository;
  metrics: MetricsStore;
  tenants: TenantDirectory;
}

export function createRepositories(retentionHours: number, tenants: AccountTenant[], now: () => number = Date.now): Repositories {
  return {
    changeRequests: new ChangeRequestRepository(),
    backups: new BackupRepository(),
    maintenanceWindows: new MaintenanceWindowRepository(),
    alerts: new AlertRepository(),
    metrics: new MetricsStore(retentionHours * 3_600_000, now),
    tenants: new TenantDirectory(tenants),
  };
}
