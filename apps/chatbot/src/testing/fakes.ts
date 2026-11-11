import jwt from 'jsonwebtoken';
import {
  AccountClient,
  AccountSummary,
  BillingClient,
  CreateTicketRequest,
  Invoice,
  LineDiagnostic,
  NetworkClient,
  OutageStatus,
  PlanOffer,
  PlatformClients,
  Ticket,
  TicketClient,
  UpgradeOrderResult,
} from '../clients/platformClients';
import { AppConfig } from '../config';
import { DownstreamError, NotFoundError } from '../domain/errors';
import { Page } from '../domain/types';

/**
 * In-memory fakes of the platform APIs plus fixture builders, shared by
 * flow, service and HTTP tests.
 */

export const ACCOUNT_ID = 'ACC-12345678';

export function gbp(amountMinor: number) {
  return { amountMinor, currency: 'GBP' };
}

export function account(overrides: Partial<AccountSummary> = {}): AccountSummary {
  return {
    accountId: ACCOUNT_ID,
    name: 'Jane Customer',
    segment: 'CONSUMER',
    services: [
      {
        serviceId: 'SVC-1',
        productCode: 'FIBRE-500',
        productName: 'Fibre 500',
        downloadMbps: 500,
        uploadMbps: 100,
        status: 'ACTIVE',
        serviceAddress: { line1: '1 High Street', town: 'London', postcode: 'SW1A 1AA' },
        monthlyPrice: gbp(3500),
      },
    ],
    ...overrides,
  };
}

export function invoice(id: string, totalMinor: number, overrides: Partial<Invoice> = {}): Invoice {
  return {
    invoiceId: id,
    accountId: ACCOUNT_ID,
    periodStart: '2026-10-01T00:00:00Z',
    periodEnd: '2026-10-31T23:59:59Z',
    issuedAt: '2026-11-01T00:00:00Z',
    dueDate: '2026-11-15T00:00:00Z',
    status: 'ISSUED',
    total: gbp(totalMinor),
    balanceDue: gbp(totalMinor),
    lines: [{ description: 'Fibre 500 monthly', amount: gbp(3500), category: 'RECURRING' }],
    ...overrides,
  };
}

export class FakeAccountClient implements AccountClient {
  calls = 0;
  constructor(public summary: AccountSummary = account(), public failWith?: Error) {}
  async getAccount(): Promise<AccountSummary> {
    this.calls += 1;
    if (this.failWith) throw this.failWith;
    return this.summary;
  }
}

export class FakeBillingClient implements BillingClient {
  invoices: Invoice[] = [invoice('INV-00000002', 4999), invoice('INV-00000001', 3500)];
  offers: PlanOffer[] = [
    { code: 'FIBRE-900', name: 'Fibre 900', downloadMbps: 900, uploadMbps: 200, monthly: gbp(4500), contractMonths: 18 },
    { code: 'FIBRE-1000', name: 'Gigabit', downloadMbps: 1000, uploadMbps: 1000, monthly: gbp(5500), contractMonths: 18 },
    { code: 'FIBRE-100', name: 'Fibre 100', downloadMbps: 100, uploadMbps: 20, monthly: gbp(2500), contractMonths: 12 },
  ];
  planChanges: Array<{ serviceId: string; planCode: string; key: string }> = [];

  async listInvoices(_accountId: string, _ctx: unknown, page = 1, pageSize = 3): Promise<Page<Invoice>> {
    const start = (page - 1) * pageSize;
    return { items: this.invoices.slice(start, start + pageSize), page, pageSize, total: this.invoices.length };
  }

  async getInvoice(_accountId: string, invoiceId: string): Promise<Invoice> {
    const found = this.invoices.find((i) => i.invoiceId === invoiceId);
    if (!found) throw new DownstreamError('billing-api', 404, 'invoice not found');
    return found;
  }

  async listUpgradeOffers(): Promise<PlanOffer[]> {
    return this.offers;
  }

  async submitPlanChange(_accountId: string, serviceId: string, planCode: string, _ctx: unknown, key: string): Promise<UpgradeOrderResult> {
    this.planChanges.push({ serviceId, planCode, key });
    return { orderId: 'ORD-0001', status: 'SUBMITTED', effectiveDate: '2026-11-20T00:00:00Z' };
  }
}

export class FakeTicketClient implements TicketClient {
  created: Array<{ request: CreateTicketRequest; key: string }> = [];
  failNext = false;

  async createTicket(request: CreateTicketRequest, _ctx: unknown, key: string): Promise<Ticket> {
    if (this.failNext) {
      this.failNext = false;
      throw new DownstreamError('ticket-api', 503, 'unavailable');
    }
    const existing = this.created.find((c) => c.key === key);
    const ticketId = existing ? `TKT-${String(this.created.indexOf(existing) + 1).padStart(7, '0')}` : `TKT-${String(this.created.length + 1).padStart(7, '0')}`;
    if (!existing) this.created.push({ request, key });
    return { ticketId, accountId: request.accountId, priority: request.priority, status: 'OPEN', subject: request.subject, createdAt: '2026-11-11T10:00:00Z' };
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    throw new NotFoundError('Ticket', ticketId);
  }
}

export class FakeNetworkClient implements NetworkClient {
  outage: OutageStatus = { postcode: 'SW1A 1AA', region: 'Westminster', status: 'NO_KNOWN_ISSUES' };
  diagnostic: LineDiagnostic = { serviceId: 'SVC-1', ontOnline: true, routerOnline: true, lastSeen: '2026-11-11T09:59:00Z', opticalSignalDbm: -18 };
  reboots: string[] = [];
  outageQueries: string[] = [];

  async getOutageStatus(postcode: string): Promise<OutageStatus> {
    this.outageQueries.push(postcode);
    return { ...this.outage, postcode };
  }

  async runLineDiagnostic(): Promise<LineDiagnostic> {
    return this.diagnostic;
  }

  async requestRemoteReboot(serviceId: string): Promise<{ accepted: boolean; jobId?: string }> {
    this.reboots.push(serviceId);
    return { accepted: true, jobId: 'JOB-1' };
  }
}

export interface FakeClients extends PlatformClients {
  account: FakeAccountClient;
  billing: FakeBillingClient;
  tickets: FakeTicketClient;
  network: FakeNetworkClient;
}

export function fakeClients(): FakeClients {
  return {
    account: new FakeAccountClient(),
    billing: new FakeBillingClient(),
    tickets: new FakeTicketClient(),
    network: new FakeNetworkClient(),
  };
}

export const TEST_SECRET = 'test-secret-for-unit-tests-only';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    env: 'test',
    logLevel: 'error',
    auth: { issuer: 'https://issuer.test', audience: 'uniti-chatbot', sharedSecret: TEST_SECRET },
    downstream: {
      accountBaseUrl: 'http://account.test',
      billingBaseUrl: 'http://billing.test',
      ticketBaseUrl: 'http://ticket.test',
      networkBaseUrl: 'http://network.test',
      timeoutMs: 1000,
      retries: 0,
    },
    llm: { provider: 'none', timeoutMs: 1000 },
    nluMinConfidence: 0.55,
    sessionTtlSeconds: 600,
    rateLimit: { windowMs: 60_000, maxMessages: 30 },
    analytics: { batchSize: 10, flushIntervalMs: 0 },
    widgetAllowedOrigins: ['https://selfcare.test'],
    ...overrides,
  };
}

export function signToken(claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}): string {
  return jwt.sign(
    { sub: 'user-1', account_id: ACCOUNT_ID, roles: ['CONSUMER'], name: 'Jane Customer', ...claims },
    TEST_SECRET,
    { algorithm: 'HS256', issuer: 'https://issuer.test', audience: 'uniti-chatbot', expiresIn: '5m', ...options },
  );
}

/** A Monday at 10:00 London time: inside every queue's opening hours. */
export const OPEN_HOURS_CLOCK = () => new Date('2026-11-09T10:00:00Z');
/** A Sunday at 03:00 London time: only the business queue is open. */
export const CLOSED_HOURS_CLOCK = () => new Date('2026-11-08T03:00:00Z');
