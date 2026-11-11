import type { ApiClient } from './client';
import type {
  CommissionSummary, ConvertLeadRequest, ConvertLeadResult, Deal, DealStatus, Lead, LeadRequest, LeadStatus, Page,
  PartnerUser, PartnerUserRole, PipelineKpis, PricingPreview, Product, ProductCategory, Quote, QuoteRequest,
  QuoteStatus, SeatUsage, Statement, StatementDetail,
} from './types';

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** Typed wrappers over the REST resources, grouped by module. */
export function endpoints(api: ApiClient) {
  return {
    dashboard: {
      pipeline: (days: number) => api.request<PipelineKpis>('/api/v1/dashboard/pipeline', { query: { days } }),
    },
    leads: {
      search: (q: PageQuery & { status?: LeadStatus; mine?: boolean; q?: string; sort?: 'score' | 'createdAt' }) =>
        api.request<Page<Lead>>('/api/v1/leads', { query: { ...q } }),
      create: (body: LeadRequest) => api.request<Lead>('/api/v1/leads', { method: 'POST', body }),
      transition: (id: string, status: LeadStatus, reason?: string) =>
        api.request<Lead>(`/api/v1/leads/${id}/transition`, { method: 'POST', body: { status, reason } }),
      convert: (id: string, body: ConvertLeadRequest) =>
        api.request<ConvertLeadResult>(`/api/v1/leads/${id}/convert`, { method: 'POST', body }),
    },
    deals: {
      search: (q: PageQuery & { status?: DealStatus; q?: string }) =>
        api.request<Page<Deal>>('/api/v1/deals', { query: { ...q } }),
      extend: (id: string) => api.request<Deal>(`/api/v1/deals/${id}/extend`, { method: 'POST' }),
      outcome: (id: string, outcome: 'WON' | 'LOST', reason?: string) =>
        api.request<Deal>(`/api/v1/deals/${id}/outcome`, { method: 'POST', body: { outcome, reason } }),
    },
    catalog: {
      list: (category?: ProductCategory) =>
        api.request<Product[]>('/api/v1/catalog/products', { query: { category } }),
    },
    quotes: {
      search: (q: PageQuery & { status?: QuoteStatus; q?: string }) =>
        api.request<Page<Quote>>('/api/v1/quotes', { query: { ...q } }),
      preview: (body: QuoteRequest, signal?: AbortSignal) =>
        api.request<PricingPreview>('/api/v1/quotes/preview', { method: 'POST', body, signal }),
      create: (body: QuoteRequest) => api.request<Quote>('/api/v1/quotes', { method: 'POST', body }),
      submit: (id: string) => api.request<Quote>(`/api/v1/quotes/${id}/submit`, { method: 'POST' }),
    },
    commissions: {
      summary: () => api.request<CommissionSummary>('/api/v1/commissions/summary'),
      statements: (q: PageQuery) => api.request<Page<Statement>>('/api/v1/commissions/statements', { query: { ...q } }),
      statement: (id: string) => api.request<StatementDetail>(`/api/v1/commissions/statements/${id}`),
      dispute: (id: string, reason: string) =>
        api.request<Statement>(`/api/v1/commissions/statements/${id}/dispute`, { method: 'POST', body: { reason } }),
    },
    users: {
      list: (partnerId: string, q: PageQuery) =>
        api.request<Page<PartnerUser>>(`/api/v1/partners/${partnerId}/users`, { query: { ...q } }),
      seats: (partnerId: string) => api.request<SeatUsage>(`/api/v1/partners/${partnerId}/users/seats`),
      invite: (partnerId: string, body: { email: string; firstName: string; lastName: string; role: PartnerUserRole }) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users`, { method: 'POST', body }),
      update: (partnerId: string, user: PartnerUser, role: PartnerUserRole) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${user.id}`, {
          method: 'PUT',
          body: { firstName: user.firstName, lastName: user.lastName, role },
        }),
      resendInvite: (partnerId: string, userId: string) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${userId}/resend-invite`, { method: 'POST' }),
      deactivate: (partnerId: string, userId: string) =>
        api.request<PartnerUser>(`/api/v1/partners/${partnerId}/users/${userId}/deactivate`, { method: 'POST' }),
    },
  };
}

export type Endpoints = ReturnType<typeof endpoints>;
