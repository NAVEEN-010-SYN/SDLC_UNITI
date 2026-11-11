import { AuthContext } from '../auth/permissions';
import { Db } from '../db/query';
import { AuditEntry, AuditRepository } from '../modules/audit/audit.repository';
import { Service, Site } from '../modules/inventory/inventory.types';

export const ACCOUNT_ID = 'ACC-10000001';
export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function adminCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: ADMIN_ID,
    email: 'admin@acme.example',
    roles: ['BUSINESS_ADMIN'],
    accountId: ACCOUNT_ID,
    siteScope: null,
    ...overrides
  };
}

export function userCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: USER_ID,
    email: 'user@acme.example',
    roles: ['BUSINESS_USER'],
    accountId: ACCOUNT_ID,
    siteScope: [SITE_A],
    ...overrides
  };
}

export function agentCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: AGENT_ID,
    email: 'agent@uniti.example',
    roles: ['SUPPORT_AGENT'],
    accountId: ACCOUNT_ID,
    siteScope: null,
    ...overrides
  };
}

/** A Db whose transactions simply invoke the callback; repositories are faked separately. */
export function passthroughDb(): Db {
  const db: Db = {
    many: jest.fn(async () => []),
    oneOrNone: jest.fn(async () => null),
    one: jest.fn(async () => {
      throw new Error('not expected in unit test');
    }),
    exec: jest.fn(async () => 0),
    tx: jest.fn(async (fn) => fn(db))
  };
  return db;
}

export interface RecordingAudit extends AuditRepository {
  entries: AuditEntry[];
}

export function recordingAudit(): RecordingAudit {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record: jest.fn(async (entry: AuditEntry) => {
      entries.push(entry);
    }),
    list: jest.fn()
  };
}

export function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_A,
    accountId: ACCOUNT_ID,
    code: 'LDN-01',
    name: 'London HQ',
    addressLine1: '1 Fibre Way',
    addressLine2: null,
    city: 'London',
    postcode: 'EC1A 1BB',
    country: 'GB',
    status: 'ACTIVE',
    costCentreId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    accountId: ACCOUNT_ID,
    siteId: SITE_A,
    contractId: null,
    costCentreId: null,
    productCode: 'FTTP-1000',
    productName: 'Business Fibre 1 Gbps',
    category: 'BROADBAND',
    bandwidthMbps: 1000,
    status: 'ACTIVE',
    slaTier: 'ENHANCED',
    monthlyChargeMinor: 12000,
    currency: 'GBP',
    activatedAt: '2024-01-10T00:00:00.000Z',
    ceasedAt: null,
    ...overrides
  };
}
