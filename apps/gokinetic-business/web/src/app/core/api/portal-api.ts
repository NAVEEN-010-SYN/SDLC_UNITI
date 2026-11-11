import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Account,
  AddPaymentMethod,
  AuditEntry,
  BusinessRole,
  BusinessUser,
  CatalogueProduct,
  Invoice,
  InvoiceDetail,
  InvoiceStatus,
  InventorySummary,
  NewTicket,
  Order,
  OrderDetail,
  OrderQuote,
  OrderRequest,
  OrderStatus,
  OrderType,
  Page,
  PageRequest,
  PaymentMethod,
  Service,
  ServiceCategory,
  ServiceStatus,
  SiteDetail,
  SiteStatus,
  SiteSummary,
  SlaReport,
  SpendTrendPoint,
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  Ticket,
  UserAction,
  UserStatus
} from '../models/api.models';
import { api, toParams } from './http-params';

type Items<T> = { items: T[] };

export interface SiteFilter { status?: SiteStatus; search?: string }
export interface ServiceFilter { siteId?: string; category?: ServiceCategory; status?: ServiceStatus }
export interface OrderFilter { status?: OrderStatus; orderType?: OrderType; siteId?: string }
export interface InvoiceFilter { status?: InvoiceStatus; fromPeriod?: string; toPeriod?: string }
export interface UserFilter { role?: BusinessRole; status?: UserStatus; search?: string }
export interface TicketFilter { status?: TicketStatus; priority?: TicketPriority; category?: TicketCategory; search?: string; activeOnly?: boolean }
export interface AuditFilter { entity?: string; actorId?: string }

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<InventorySummary> {
    return this.http.get<InventorySummary>(api('/inventory/summary'));
  }
  sites(filter: SiteFilter, page: PageRequest): Observable<Page<SiteSummary>> {
    return this.http.get<Page<SiteSummary>>(api('/sites'), { params: toParams({ ...filter, ...page }) });
  }
  site(id: string): Observable<SiteDetail> {
    return this.http.get<SiteDetail>(api(`/sites/${id}`));
  }
  services(filter: ServiceFilter, page: PageRequest): Observable<Page<Service>> {
    return this.http.get<Page<Service>>(api('/services'), { params: toParams({ ...filter, ...page }) });
  }
  /** All active services for pickers; the API caps pages at 100 which covers a site comfortably. */
  servicesForSite(siteId: string): Observable<Service[]> {
    return this.services({ siteId }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items.filter((s) => s.status !== 'CEASED')));
  }
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  products(): Observable<CatalogueProduct[]> {
    return this.http.get<Items<CatalogueProduct>>(api('/catalogue/products')).pipe(map((r) => r.items));
  }
  list(filter: OrderFilter, page: PageRequest): Observable<Page<Order>> {
    return this.http.get<Page<Order>>(api('/orders'), { params: toParams({ ...filter, ...page }) });
  }
  get(id: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(api(`/orders/${id}`));
  }
  quote(request: OrderRequest): Observable<OrderQuote> {
    return this.http.post<OrderQuote>(api('/orders/quote'), request);
  }
  create(request: OrderRequest, submit: boolean): Observable<Order> {
    return this.http.post<Order>(api('/orders'), { ...request, submit });
  }
  submit(id: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/submit`), {});
  }
  approve(id: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/approve`), {});
  }
  reject(id: string, reason: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/reject`), { reason });
  }
  cancel(id: string, reason: string): Observable<Order> {
    return this.http.post<Order>(api(`/orders/${id}/cancel`), { reason });
  }
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  invoices(filter: InvoiceFilter, page: PageRequest): Observable<Page<Invoice>> {
    return this.http.get<Page<Invoice>>(api('/invoices'), { params: toParams({ ...filter, ...page }) });
  }
  invoice(id: string): Observable<InvoiceDetail> {
    return this.http.get<InvoiceDetail>(api(`/invoices/${id}`));
  }
  dispute(id: string, reason: string): Observable<Invoice> {
    return this.http.post<Invoice>(api(`/invoices/${id}/dispute`), { reason });
  }
  allocationCsv(id: string): Observable<Blob> {
    return this.http.get(api(`/invoices/${id}/allocation`), { headers: { Accept: 'text/csv' }, responseType: 'blob' });
  }
  spendTrend(fromPeriod: string, toPeriod: string): Observable<SpendTrendPoint[]> {
    return this.http.get<Items<SpendTrendPoint>>(api('/billing/spend-trend'), { params: toParams({ fromPeriod, toPeriod }) }).pipe(map((r) => r.items));
  }
  paymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<Items<PaymentMethod>>(api('/payment-methods')).pipe(map((r) => r.items));
  }
  addPaymentMethod(input: AddPaymentMethod): Observable<PaymentMethod> {
    return this.http.post<PaymentMethod>(api('/payment-methods'), input);
  }
  makeDefault(id: string): Observable<PaymentMethod[]> {
    return this.http.post<Items<PaymentMethod>>(api(`/payment-methods/${id}/default`), {}).pipe(map((r) => r.items));
  }
  removePaymentMethod(id: string): Observable<void> {
    return this.http.delete<void>(api(`/payment-methods/${id}`));
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(filter: UserFilter, page: PageRequest): Observable<Page<BusinessUser>> {
    return this.http.get<Page<BusinessUser>>(api('/users'), { params: toParams({ ...filter, ...page }) });
  }
  invite(input: { email: string; firstName: string; lastName: string; role: BusinessRole; siteScope: string[] | null }): Observable<BusinessUser> {
    return this.http.post<BusinessUser>(api('/users'), input);
  }
  changeRole(user: BusinessUser, role: BusinessRole, siteScope: string[] | null): Observable<BusinessUser> {
    return this.http.put<BusinessUser>(api(`/users/${user.id}/role`), { role, siteScope, version: user.version });
  }
  transition(user: BusinessUser, action: UserAction): Observable<BusinessUser> {
    return this.http.post<BusinessUser>(api(`/users/${user.id}/${action}`), { version: user.version });
  }
  resendInvitation(id: string): Observable<void> {
    return this.http.post<void>(api(`/users/${id}/resend-invitation`), {});
  }
}

@Injectable({ providedIn: 'root' })
export class TicketsApi {
  private readonly http = inject(HttpClient);

  list(filter: TicketFilter, page: PageRequest): Observable<Page<Ticket>> {
    return this.http.get<Page<Ticket>>(api('/tickets'), { params: toParams({ ...filter, ...page }) });
  }
  get(id: string): Observable<TicketDetail> {
    return this.http.get<TicketDetail>(api(`/tickets/${id}`));
  }
  create(input: NewTicket): Observable<Ticket> {
    return this.http.post<Ticket>(api('/tickets'), input);
  }
  comment(ticket: Ticket, body: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/comments`), { body, internal: false, version: ticket.version });
  }
  changeStatus(ticket: Ticket, status: TicketStatus, reason?: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/status`), { status, reason, version: ticket.version });
  }
  escalate(ticket: Ticket, reason: string): Observable<Ticket> {
    return this.http.post<Ticket>(api(`/tickets/${ticket.id}/escalate`), { reason, version: ticket.version });
  }
}

@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);

  account(): Observable<Account> {
    return this.http.get<Account>(api('/account'));
  }
  setApprovalThreshold(approvalThresholdMinor: number): Observable<Account> {
    return this.http.put<Account>(api('/account/approval-threshold'), { approvalThresholdMinor });
  }
  slaReport(period: string): Observable<SlaReport> {
    return this.http.get<SlaReport>(api(`/sla/reports/${period}`));
  }
  auditLog(filter: AuditFilter, page: PageRequest): Observable<Page<AuditEntry>> {
    return this.http.get<Page<AuditEntry>>(api('/audit-log'), { params: toParams({ ...filter, ...page }) });
  }
  auditCsv(filter: AuditFilter): Observable<Blob> {
    return this.http.get(api('/audit-log/export'), { params: toParams({ ...filter }), responseType: 'blob' });
  }
}
