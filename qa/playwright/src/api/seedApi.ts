import { ApiClient, Page } from './apiClient';
import {
  Account,
  ChangeRequest,
  Deal,
  Invoice,
  Order,
  OrderStatus,
  Product,
  SdwanSite,
  Ticket,
} from './domain';
import { DealDraft, OrderDraft, TicketDraft } from '@data/builders';

/**
 * Domain-level API helpers used to arrange state before UI steps and to verify
 * side effects afterwards. Every helper goes through the versioned /api/v1 surface.
 */
export class SeedApi {
  constructor(private readonly api: ApiClient) {}

  listProducts(segment: 'B2C' | 'B2B'): Promise<Page<Product>> {
    return this.api.get<Page<Product>>('/api/v1/catalogue/products', {
      query: { segment, page: 1, pageSize: 50 },
    });
  }

  getAccount(accountId: string): Promise<Account> {
    return this.api.get<Account>(`/api/v1/accounts/${accountId}`);
  }

  createOrder(draft: OrderDraft): Promise<Order> {
    return this.api.post<Order>('/api/v1/orders', { body: draft, expectedStatus: 201 });
  }

  getOrder(orderId: string): Promise<Order> {
    return this.api.get<Order>(`/api/v1/orders/${orderId}`);
  }

  async waitForOrderStatus(orderId: string, target: OrderStatus, timeoutMs = 60_000): Promise<Order> {
    const deadline = Date.now() + timeoutMs;
    let order = await this.getOrder(orderId);
    while (order.status !== target && Date.now() < deadline) {
      if (order.status === 'FAILED' || order.status === 'CANCELLED') {
        throw new Error(`Order ${orderId} reached terminal status ${order.status} while waiting for ${target}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      order = await this.getOrder(orderId);
    }
    if (order.status !== target) {
      throw new Error(`Order ${orderId} still ${order.status} after ${timeoutMs}ms (wanted ${target})`);
    }
    return order;
  }

  cancelOrder(orderId: string): Promise<Order> {
    return this.api.post<Order>(`/api/v1/orders/${orderId}/cancel`, { body: { reason: 'QA_CLEANUP' } });
  }

  listInvoices(accountId: string): Promise<Page<Invoice>> {
    return this.api.get<Page<Invoice>>(`/api/v1/accounts/${accountId}/invoices`, {
      query: { page: 1, pageSize: 12 },
    });
  }

  createTicket(accountId: string, draft: TicketDraft): Promise<Ticket> {
    return this.api.post<Ticket>(`/api/v1/accounts/${accountId}/tickets`, { body: draft, expectedStatus: 201 });
  }

  getTicket(ticketId: string): Promise<Ticket> {
    return this.api.get<Ticket>(`/api/v1/tickets/${ticketId}`);
  }

  closeTicket(ticketId: string): Promise<Ticket> {
    return this.api.patch<Ticket>(`/api/v1/tickets/${ticketId}`, { body: { status: 'CLOSED' } });
  }

  registerDeal(draft: DealDraft): Promise<Deal> {
    return this.api.post<Deal>('/api/v1/partner/deals', { body: draft, expectedStatus: 201 });
  }

  withdrawDeal(dealId: string): Promise<void> {
    return this.api.delete(`/api/v1/partner/deals/${dealId}`, { expectedStatus: [204, 404] });
  }

  listSites(accountId: string): Promise<Page<SdwanSite>> {
    return this.api.get<Page<SdwanSite>>('/api/v1/sdwan/sites', { query: { accountId, page: 1, pageSize: 25 } });
  }

  getChangeRequest(changeRequestId: string): Promise<ChangeRequest> {
    return this.api.get<ChangeRequest>(`/api/v1/sdwan/change-requests/${changeRequestId}`);
  }

  withdrawChangeRequest(changeRequestId: string): Promise<void> {
    return this.api.delete(`/api/v1/sdwan/change-requests/${changeRequestId}`, { expectedStatus: [204, 404, 409] });
  }
}
