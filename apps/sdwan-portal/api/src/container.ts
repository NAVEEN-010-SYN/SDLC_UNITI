import type { AppConfig } from './config/env';
import type { JwtSettings } from './auth/jwt';
import type { Logger } from './logging/logger';
import { ProviderRegistry } from './providers/ProviderRegistry';
import { AccountTenant, createRepositories, Repositories } from './repositories';
import { AlertService } from './services/AlertService';
import { BackupService } from './services/BackupService';
import { ChangeRequestService } from './services/ChangeRequestService';
import { EdgeConfigService } from './services/EdgeConfigService';
import { HealthService } from './services/HealthService';
import { InventoryService } from './services/InventoryService';
import { MaintenanceWindowService } from './services/MaintenanceWindowService';
import { ReportService } from './services/ReportService';

export interface Container {
  jwt: JwtSettings;
  providers: ProviderRegistry;
  repos: Repositories;
  inventory: InventoryService;
  health: HealthService;
  edgeConfig: EdgeConfigService;
  backups: BackupService;
  windows: MaintenanceWindowService;
  changes: ChangeRequestService;
  alerts: AlertService;
  reports: ReportService;
  logger: Logger;
}

/** Tenants used in mock mode so the portal is usable without any directory configuration. */
export const MOCK_TENANTS: AccountTenant[] = [
  { accountId: 'ACC-10000001', vendor: 'VELOCLOUD', tenant: '1001' },
  { accountId: 'ACC-10000001', vendor: 'FORTINET', tenant: 'acme' },
];

/**
 * Parses SDWAN_TENANTS: comma-separated `ACCOUNT:VENDOR:TENANT` triples, e.g.
 * `ACC-10000001:VELOCLOUD:1001,ACC-10000001:FORTINET:acme`.
 */
export function parseTenantDirectory(raw: string | undefined): AccountTenant[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((entry) => {
    const [accountId, vendor, tenant] = entry.trim().split(':');
    if (!/^ACC-\d{8}$/.test(accountId ?? '') || (vendor !== 'VELOCLOUD' && vendor !== 'FORTINET') || !tenant) {
      throw new Error(`Invalid SDWAN_TENANTS entry "${entry.trim()}", expected ACC-########:VELOCLOUD|FORTINET:<tenant>`);
    }
    return { accountId, vendor, tenant };
  });
}

export function createContainer(
  cfg: AppConfig,
  logger: Logger,
  opts: { tenants?: AccountTenant[]; providers?: ProviderRegistry; now?: () => Date } = {},
): Container {
  const providers = opts.providers ?? ProviderRegistry.fromConfig(cfg, logger);
  const tenants = opts.tenants ?? (cfg.SDWAN_PROVIDER_MODE === 'mock' ? MOCK_TENANTS : []);
  const now = opts.now ?? (() => new Date());
  const repos = createRepositories(cfg.METRICS_RETENTION_HOURS, tenants, () => now().getTime());

  const inventory = new InventoryService(providers, repos.tenants, logger.child({ svc: 'inventory' }), cfg.INVENTORY_CACHE_TTL_SEC * 1000);
  const backups = new BackupService(repos.backups, inventory, logger.child({ svc: 'backups' }), now);
  return {
    jwt: { issuer: cfg.JWT_ISSUER, audience: cfg.JWT_AUDIENCE, secret: cfg.JWT_SECRET, publicKey: cfg.JWT_PUBLIC_KEY || undefined },
    providers,
    repos,
    inventory,
    health: new HealthService(inventory, repos.metrics, logger.child({ svc: 'health' })),
    edgeConfig: new EdgeConfigService(inventory),
    backups,
    windows: new MaintenanceWindowService(repos.maintenanceWindows, repos.changeRequests, now),
    changes: new ChangeRequestService(repos.changeRequests, repos.maintenanceWindows, inventory, backups, logger.child({ svc: 'changes' }), now),
    alerts: new AlertService(repos.alerts, inventory, repos.metrics, providers, repos.tenants, logger.child({ svc: 'alerts' }), now),
    reports: new ReportService(inventory, repos.metrics, now),
    logger,
  };
}
