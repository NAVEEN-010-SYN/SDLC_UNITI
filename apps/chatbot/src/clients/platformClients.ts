import { Money, Page, TicketPriority, TicketStatus } from '../domain/types';
import { HttpClient, RequestContext } from './httpClient';

/**
 * Typed clients for the platform APIs the chatbot integrates with.
 * Each wraps an HttpClient and exposes only the operations the dialog flows need.
 */

// ---------------------------------------------------------------- Account API

export interface ServiceSummary {
  serviceId: string;
  productCode: string;
  productName: string;
  downloadMbps: number;
  uploadMbps: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'CEASED';
  serviceAddress: { line1: string; town: string; postcode: string };
  monthlyPrice: Money;
  contractEndDate?: string;
}

export interface AccountSummary {
  accountId: string;
  name: string;
  segment: 'CONSUMER' | 'BUSINESS';
  services: ServiceSummary[];
}

export interface AccountClient {
  getAccount(accountId: string, ctx: RequestContext): Promise<AccountSummary>;
}

export class HttpAccountClient implements AccountClient {
  constructor(private readonly http: HttpClient) {}

  getAccount(accountId: string, ctx: RequestContext): Promise<AccountSummary> {
    return this.http.get<AccountSummary>(`/accounts/${encodeURIComponent(accountId)}`, ctx);
  }
}

// ---------------------------------------------------------------- Billing API

export interface InvoiceLine {
  description: string;
  amount: Money;
  category: 'RECURRING' | 'ONE_OFF' | 'USAGE' | 'CREDIT' | 'DISCOUNT';
}

export interface Invoice {
  invoiceId: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueDate: string;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'PARTIALLY_PAID';
  total: Money;
  balanceDue: Money;
  lines: InvoiceLine[];
}

export interface PlanOffer {
  code: string;
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  monthly: Money;
  contractMonths: number;
}

export interface UpgradeOrderResult {
  orderId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';
  effectiveDate: string;
}

export interface BillingClient {
  listInvoices(accountId: string, ctx: RequestContext, page?: number, pageSize?: number): Promise<Page<Invoice>>;
  getInvoice(accountId: string, invoiceId: string, ctx: RequestContext): Promise<Invoice>;
  listUpgradeOffers(accountId: string, serviceId: string, ctx: RequestContext): Promise<PlanOffer[]>;
  submitPlanChange(
    accountId: string,
    serviceId: string,
    planCode: string,
    ctx: RequestContext,
    idempotencyKey: string,
  ): Promise<UpgradeOrderResult>;
}

export class HttpBillingClient implements BillingClient {
  constructor(private readonly http: HttpClient) {}

  listInvoices(accountId: string, ctx: RequestContext, page = 1, pageSize = 3): Promise<Page<Invoice>> {
    return this.http.get<Page<Invoice>>(`/accounts/${encodeURIComponent(accountId)}/invoices`, ctx, { page, pageSize });
  }

  getInvoice(accountId: string, invoiceId: string, ctx: RequestContext): Promise<Invoice> {
    return this.http.get<Invoice>(`/accounts/${encodeURIComponent(accountId)}/invoices/${encodeURIComponent(invoiceId)}`, ctx);
  }

  listUpgradeOffers(accountId: string, serviceId: string, ctx: RequestContext): Promise<PlanOffer[]> {
    return this.http.get<PlanOffer[]>(
      `/accounts/${encodeURIComponent(accountId)}/services/${encodeURIComponent(serviceId)}/upgrade-offers`,
      ctx,
    );
  }

  submitPlanChange(
    accountId: string,
    serviceId: string,
    planCode: string,
    ctx: RequestContext,
    idempotencyKey: string,
  ): Promise<UpgradeOrderResult> {
    return this.http.post<UpgradeOrderResult>(
      `/accounts/${encodeURIComponent(accountId)}/orders`,
      ctx,
      { type: 'PLAN_CHANGE', serviceId, targetProductCode: planCode },
      idempotencyKey,
    );
  }
}

// ---------------------------------------------------------------- Ticket API

export interface CreateTicketRequest {
  accountId: string;
  category: 'FAULT' | 'BILLING' | 'COMPLAINT' | 'GENERAL' | 'HANDOFF';
  priority: TicketPriority;
  subject: string;
  description: string;
  contactPhone?: string;
  serviceId?: string;
  source: 'CHATBOT';
  conversationId: string;
}

export interface Ticket {
  ticketId: string;
  accountId: string;
  priority: TicketPriority;
  status: TicketStatus;
  subject: string;
  createdAt: string;
}

export interface TicketClient {
  createTicket(request: CreateTicketRequest, ctx: RequestContext, idempotencyKey: string): Promise<Ticket>;
  getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket>;
}

export class HttpTicketClient implements TicketClient {
  constructor(private readonly http: HttpClient) {}

  createTicket(request: CreateTicketRequest, ctx: RequestContext, idempotencyKey: string): Promise<Ticket> {
    return this.http.post<Ticket>('/tickets', ctx, request, idempotencyKey);
  }

  getTicket(ticketId: string, ctx: RequestContext): Promise<Ticket> {
    return this.http.get<Ticket>(`/tickets/${encodeURIComponent(ticketId)}`, ctx);
  }
}

// ---------------------------------------------------------------- Network API

export interface OutageStatus {
  postcode: string;
  region: string;
  status: 'NO_KNOWN_ISSUES' | 'INVESTIGATING' | 'OUTAGE' | 'PLANNED_WORK' | 'RESTORED';
  incidentId?: string;
  summary?: string;
  estimatedRestore?: string;
}

export interface LineDiagnostic {
  serviceId: string;
  ontOnline: boolean;
  routerOnline: boolean;
  lastSeen: string;
  opticalSignalDbm?: number;
}

export interface NetworkClient {
  getOutageStatus(postcode: string, ctx: RequestContext): Promise<OutageStatus>;
  runLineDiagnostic(serviceId: string, ctx: RequestContext): Promise<LineDiagnostic>;
  requestRemoteReboot(serviceId: string, ctx: RequestContext, idempotencyKey: string): Promise<{ accepted: boolean; jobId?: string }>;
}

export class HttpNetworkClient implements NetworkClient {
  constructor(private readonly http: HttpClient) {}

  getOutageStatus(postcode: string, ctx: RequestContext): Promise<OutageStatus> {
    return this.http.get<OutageStatus>('/network/outages', ctx, { postcode });
  }

  runLineDiagnostic(serviceId: string, ctx: RequestContext): Promise<LineDiagnostic> {
    return this.http.get<LineDiagnostic>(`/network/services/${encodeURIComponent(serviceId)}/diagnostic`, ctx);
  }

  requestRemoteReboot(serviceId: string, ctx: RequestContext, idempotencyKey: string): Promise<{ accepted: boolean; jobId?: string }> {
    return this.http.post(`/network/services/${encodeURIComponent(serviceId)}/reboot`, ctx, {}, idempotencyKey);
  }
}

export interface PlatformClients {
  account: AccountClient;
  billing: BillingClient;
  tickets: TicketClient;
  network: NetworkClient;
}
