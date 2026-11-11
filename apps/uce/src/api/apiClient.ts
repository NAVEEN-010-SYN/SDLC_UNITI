import { ApiError, toProblem } from './problem';

/**
 * Browser API client for the Uniti /api/v1 surface.
 *  - Bearer token from the auth session on every call (refreshed by the provider).
 *  - X-Correlation-Id minted per logical request and reused across retries, so
 *    Kibana/Dynatrace can join the browser call with downstream service logs.
 *  - X-Account-Id carries the active account for multi-account business users.
 *  - Errors always surface as ApiError carrying RFC 7807 problem details.
 *  - Idempotent methods are retried on 502/503/504 and network failures.
 */

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Idempotency-Key for POSTs that create resources. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs: number;
  getAccessToken: () => Promise<string | undefined>;
  getAccountId?: () => string | undefined;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE']);

export function newCorrelationId(): string {
  return `uce-${crypto.randomUUID()}`;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.append(key, String(value));
  }
  const qs = params.toString();
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  private async request<T>(method: string, path: string, body: unknown, options: RequestOptions): Promise<T> {
    const url = buildUrl(this.options.baseUrl, path, options.query);
    const correlationId = newCorrelationId();
    const maxAttempts = IDEMPOTENT.has(method) || options.idempotencyKey ? (this.options.retries ?? 2) + 1 : 1;

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.once<T>(method, url, path, body, options, correlationId);
      } catch (error) {
        const retry = error instanceof ApiError && error.retryable && error.status !== 429 && attempt < maxAttempts && !options.signal?.aborted;
        if (!retry) throw error;
        await this.sleep(Math.min(2000, 200 * 2 ** (attempt - 1)));
      }
    }
  }

  private async once<T>(method: string, url: string, path: string, body: unknown, options: RequestOptions, correlationId: string): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', 'X-Correlation-Id': correlationId, ...options.headers };
    const token = await this.options.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const accountId = this.options.getAccountId?.();
    if (accountId) headers['X-Account-Id'] = accountId;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs);
    const onCallerAbort = () => timeout.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: timeout.signal,
        credentials: 'same-origin',
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const timedOut = timeout.signal.aborted;
      throw new ApiError(
        { type: 'about:blank', title: timedOut ? 'Request timed out' : 'Network error', status: 0, instance: path, correlationId },
        correlationId,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCallerAbort);
    }

    const responseCorrelation = response.headers.get('X-Correlation-Id') ?? correlationId;
    if (response.status === 204) return undefined as T;
    const payload = await readBody(response);

    if (!response.ok) {
      if (response.status === 401) this.options.onUnauthorized?.();
      const problem = toProblem(response.status, response.statusText, payload, path);
      throw new ApiError({ ...problem, correlationId: problem.correlationId ?? responseCorrelation }, responseCorrelation);
    }
    return payload as T;
  }
}

async function readBody(response: Response): Promise<unknown> {
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('json')) {
    const text = await response.text();
    return text === '' ? undefined : text;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
