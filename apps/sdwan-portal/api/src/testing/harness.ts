import { signDevToken } from '../auth/jwt';
import { loadConfig } from '../config/env';
import { Container, createContainer, MOCK_TENANTS } from '../container';
import type { Principal, Role, Vendor } from '../domain/types';
import { silentLogger } from '../logging/logger';
import { MockProvider } from '../providers/mock/MockProvider';
import { ProviderRegistry } from '../providers/ProviderRegistry';

export const ACCOUNT = 'ACC-10000001';
export const OTHER_ACCOUNT = 'ACC-20000002';
/** VeloCloud HA edge at Head Office. */
export const HA_EDGE = 'vc-1001-hq-edge-1';
/** Fortinet single-link, non-HA edge in Sheffield. */
export const SOLO_EDGE = 'ft-acme-sheff-edge-1';

export class TestClock {
  constructor(public ms = Date.parse('2026-03-02T10:00:00.000Z')) {}
  now = (): Date => new Date(this.ms);
  advance(minutes: number): void {
    this.ms += minutes * 60_000;
  }
}

export interface Harness {
  c: Container;
  clock: TestClock;
  mocks: Record<Vendor, MockProvider>;
  principal(userId: string, role: Role, accountId?: string): Principal;
  token(userId: string, role: Role, accountId?: string): string;
}

export function createHarness(): Harness {
  const cfg = loadConfig({ JWT_SECRET: 'test-secret', SDWAN_PROVIDER_MODE: 'mock', NODE_ENV: 'test' });
  const mocks: Record<Vendor, MockProvider> = { VELOCLOUD: new MockProvider('VELOCLOUD'), FORTINET: new MockProvider('FORTINET') };
  const providers = new ProviderRegistry(new Map(Object.entries(mocks) as Array<[Vendor, MockProvider]>));
  const clock = new TestClock();
  const c = createContainer(cfg, silentLogger, { providers, tenants: MOCK_TENANTS, now: clock.now });
  const principal = (userId: string, role: Role, accountId: string | undefined = ACCOUNT): Principal => ({
    userId,
    roles: [role],
    accountId: role === 'SUPPORT_AGENT' ? undefined : accountId,
  });
  return {
    c,
    clock,
    mocks,
    principal,
    token: (userId, role, accountId) => signDevToken(principal(userId, role, accountId), c.jwt),
  };
}
