import type { AppConfig } from '../config/env';
import type { Vendor } from '../domain/types';
import type { Logger } from '../logging/logger';
import { FortinetAdapter } from './fortinet/FortinetAdapter';
import { FortiManagerClient } from './fortinet/FortiManagerClient';
import { MockProvider } from './mock/MockProvider';
import type { SdwanProvider } from './SdwanProvider';
import { VeloCloudAdapter } from './velocloud/VeloCloudAdapter';
import { VeloCloudClient } from './velocloud/VeloCloudClient';

/** Resolves the adapter for a vendor. Services never construct adapters directly. */
export class ProviderRegistry {
  constructor(private readonly providers: Map<Vendor, SdwanProvider>) {}

  get(vendor: Vendor): SdwanProvider {
    const p = this.providers.get(vendor);
    if (!p) throw new Error(`no SD-WAN provider registered for ${vendor}`);
    return p;
  }

  all(): SdwanProvider[] {
    return [...this.providers.values()];
  }

  async health(): Promise<Record<Vendor, boolean>> {
    const entries = await Promise.all(this.all().map(async (p) => [p.vendor, await p.ping()] as const));
    return Object.fromEntries(entries) as Record<Vendor, boolean>;
  }

  static fromConfig(cfg: AppConfig, logger: Logger): ProviderRegistry {
    if (cfg.SDWAN_PROVIDER_MODE === 'mock') {
      return new ProviderRegistry(
        new Map<Vendor, SdwanProvider>([
          ['VELOCLOUD', new MockProvider('VELOCLOUD')],
          ['FORTINET', new MockProvider('FORTINET')],
        ]),
      );
    }
    const http = {
      maxRetries: cfg.HTTP_MAX_RETRIES,
      backoffBaseMs: cfg.HTTP_BACKOFF_BASE_MS,
      backoffMaxMs: cfg.HTTP_BACKOFF_MAX_MS,
    };
    const vco = new VeloCloudClient(
      { ...http, baseUrl: cfg.VCO_BASE_URL!, timeoutMs: cfg.VCO_TIMEOUT_MS, logger: logger.child({ vendor: 'VELOCLOUD' }) },
      { username: cfg.VCO_USERNAME!, password: cfg.VCO_PASSWORD!, loginType: 'operator' },
    );
    const fmg = new FortiManagerClient(
      { ...http, baseUrl: cfg.FMG_BASE_URL!, timeoutMs: cfg.FORTI_TIMEOUT_MS, logger: logger.child({ vendor: 'FORTINET' }) },
      { username: cfg.FMG_USERNAME!, password: cfg.FMG_PASSWORD! },
    );
    return new ProviderRegistry(
      new Map<Vendor, SdwanProvider>([
        ['VELOCLOUD', new VeloCloudAdapter(vco, logger)],
        ['FORTINET', new FortinetAdapter(fmg, logger, { policyPackage: cfg.FMG_POLICY_PACKAGE })],
      ]),
    );
  }
}
