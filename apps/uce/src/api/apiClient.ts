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
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!qs) return `${baseUrl}${suffix}`;
  return `${baseUrl}${suffix}?${qs}`;
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
        if (!shouldRetry(error, attempt, maxAttempts, options.signal)) throw error;
        await this.sleep(Math.min(2000, 200 * 2 ** (attempt - 1)));
      }
    }
  }

  private async once<T>(method: string, url: string, path: string, body: unknown, options: RequestOptions, correlationId: string): Promise<T> {
    const headers = await this.buildHeaders(body !== undefined, options, correlationId);
    const response = await this.send(method, url, path, headers, body, options, correlationId);

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

  private async buildHeaders(hasBody: boolean, options: RequestOptions, correlationId: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json, application/problem+json',
      'X-Correlation-Id': correlationId,
      ...options.headers,
    };
    const token = await this.options.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const accountId = this.options.getAccountId?.();
    if (accountId) headers['X-Account-Id'] = accountId;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (hasBody) headers['Content-Type'] = 'application/json';
    return headers;
  }

  /** Runs fetch with a timeout that also honours the caller's abort signal. */
  private async send(
    method: string,
    url: string,
    path: string,
    headers: Record<string, string>,
    body: unknown,
    options: RequestOptions,
    correlationId: string,
  ): Promise<Response> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs);
    const onCallerAbort = () => timeout.abort();
    options.signal?.addEventListener('abort', onCallerAbort);

    try {
      return await this.fetchImpl(url, {
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
  }
}

/** Retries retryable ApiErrors (never 429) while attempts remain and the caller hasn't aborted. */
function shouldRetry(error: unknown, attempt: number, maxAttempts: number, signal?: AbortSignal): boolean {
  if (!(error instanceof ApiError)) return false;
  if (!error.retryable || error.status === 429) return false;
  if (attempt >= maxAttempts) return false;
  return !signal?.aborted;
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
