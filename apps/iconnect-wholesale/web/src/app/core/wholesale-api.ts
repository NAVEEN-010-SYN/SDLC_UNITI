import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AddressMatch, ApiKey, AppointmentSlot, Availability, BulkUploadResult, Dispute, FaultDetail, FaultSummary, OrderDetail,
  OrderSummary, Paged, PlaceOrderRequest, PriceBook, Product, SlaPolicy, SlaSummary, StatementDetail, StatementSummary,
} from './api.models';

const base = environment.apiBaseUrl;

/** Builds query params, dropping empty filters so the API applies its own defaults. */
export function toParams(query: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class AvailabilityApi {
  private readonly http = inject(HttpClient);

  searchAddresses(postcode: string): Observable<AddressMatch[]> {
    return this.http.get<AddressMatch[]>(`${base}/availability/addresses`, { params: toParams({ postcode }) });
  }

  check(uprn: string): Observable<Availability> {
    return this.http.get<Availability>(`${base}/availability/${encodeURIComponent(uprn)}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogueApi {
  private readonly http = inject(HttpClient);

  products(includeWithdrawn = false): Observable<Product[]> {
    return this.http.get<Product[]>(`${base}/catalogue/products`, { params: toParams({ includeWithdrawn }) });
  }

  priceBook(onDate?: string): Observable<PriceBook> {
    return this.http.get<PriceBook>(`${base}/catalogue/price-book`, { params: toParams({ onDate }) });
  }
}

export interface OrderFilter {
  status?: string;
  type?: string;
  search?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  /** Resolves to the order and whether it was newly created (false = idempotent replay of the same partner reference). */
  place(request: PlaceOrderRequest): Observable<{ order: OrderDetail; created: boolean }> {
    return this.http
      .post<OrderDetail>(`${base}/orders`, request, { observe: 'response' })
      .pipe(map((res) => ({ order: res.body as OrderDetail, created: res.status === 201 })));
  }

  list(filter: OrderFilter): Observable<Paged<OrderSummary>> {
    return this.http.get<Paged<OrderSummary>>(`${base}/orders`, { params: toParams({ ...filter }) });
  }

  get(id: string): Observable<OrderDetail> {
    return this.http.get<OrderDetail>(`${base}/orders/${id}`);
  }

  /** Partner actions: cancel (reason) and amend (requestedDate). */
  act(id: string, action: 'cancel' | 'amend', body: object): Observable<OrderDetail> {
    return this.http.post<OrderDetail>(`${base}/orders/${id}/${action}`, body);
  }

  appointmentSlots(id: string, from?: string): Observable<AppointmentSlot[]> {
    return this.http.get<AppointmentSlot[]>(`${base}/orders/${id}/appointment-slots`, { params: toParams({ from }) });
  }

  bookAppointment(id: string, slotId: string): Observable<{ slotId: string; date: string; holdExpiresAt: string; committedDate: string | null }> {
    return this.http.put<{ slotId: string; date: string; holdExpiresAt: string; committedDate: string | null }>(
      `${base}/orders/${id}/appointment`, { slotId });
  }
}

@Injectable({ providedIn: 'root' })
export class BulkOrdersApi {
  private readonly http = inject(HttpClient);

  upload(file: File, dryRun: boolean): Observable<BulkUploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<BulkUploadResult>(`${base}/bulk-orders`, form, { params: toParams({ dryRun }) });
  }

  template(): Observable<Blob> {
    return this.http.get(`${base}/bulk-orders/template`, { responseType: 'blob' });
  }
}

@Injectable({ providedIn: 'root' })
export class FaultsApi {
  private readonly http = inject(HttpClient);

  raise(body: { serviceId: string; priority: string; category: string; description: string }): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults`, body);
  }

  list(filter: { status?: string; priority?: string; page: number; pageSize: number }): Observable<Paged<FaultSummary>> {
    return this.http.get<Paged<FaultSummary>>(`${base}/faults`, { params: toParams({ ...filter }) });
  }

  get(id: string): Observable<FaultDetail> {
    return this.http.get<FaultDetail>(`${base}/faults/${id}`);
  }

  addNote(id: string, text: string): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults/${id}/notes`, { text });
  }

  transition(id: string, action: string, note?: string): Observable<FaultDetail> {
    return this.http.post<FaultDetail>(`${base}/faults/${id}/transitions`, { action, note: note ?? null, resolutionCode: null });
  }
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  statements(page: number, pageSize: number): Observable<Paged<StatementSummary>> {
    return this.http.get<Paged<StatementSummary>>(`${base}/billing/statements`, { params: toParams({ page, pageSize }) });
  }

  statement(id: string): Observable<StatementDetail> {
    return this.http.get<StatementDetail>(`${base}/billing/statements/${id}`);
  }

  exportCsv(id: string): Observable<Blob> {
    return this.http.get(`${base}/billing/statements/${id}/export`, { responseType: 'blob' });
  }

  raiseDispute(statementId: string, body: { lineIds: string[]; reason: string; claimedMinor: number }): Observable<Dispute> {
    return this.http.post<Dispute>(`${base}/billing/statements/${statementId}/disputes`, body);
  }
}

@Injectable({ providedIn: 'root' })
export class SlaApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<SlaSummary> {
    return this.http.get<SlaSummary>(`${base}/sla/summary`);
  }

  policy(): Observable<SlaPolicy> {
    return this.http.get<SlaPolicy>(`${base}/sla/policy`);
  }
}

@Injectable({ providedIn: 'root' })
export class ApiKeysApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${base}/api-keys`);
  }

  scopes(): Observable<string[]> {
    return this.http.get<string[]>(`${base}/api-keys/scopes`);
  }

  create(body: { name: string; scopes: string[]; validForDays: number }): Observable<{ key: ApiKey; secret: string }> {
    return this.http.post<{ key: ApiKey; secret: string }>(`${base}/api-keys`, body);
  }

  revoke(id: string): Observable<void> {
    return this.http.delete<void>(`${base}/api-keys/${id}`);
  }
}

/** Saves a blob response (CSV exports, templates) under the given file name. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
