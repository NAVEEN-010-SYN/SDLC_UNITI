import { toProblemError } from './problem';

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | undefined;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
  newCorrelationId?: () => string;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * Thin fetch wrapper used by every page: attaches the bearer token and a fresh
 * X-Correlation-Id per request, and turns non-2xx responses into ProblemError so callers
 * handle one error shape. A 401 means the session is gone, so the auth layer is told.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const newId = options.newCorrelationId ?? (() => crypto.randomUUID());

  return {
    async request<T>(path: string, { method = 'GET', query, body, signal }: RequestOptions = {}): Promise<T> {
      const correlationId = newId();
      const headers: Record<string, string> = {
        Accept: 'application/json, application/problem+json',
        'X-Correlation-Id': correlationId,
      };
      const token = options.getAccessToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await doFetch(buildUrl(options.baseUrl, path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        if (response.status === 401) {
          options.onUnauthorized();
        }
        throw await toProblemError(response, correlationId);
      }
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T;
      }
      return (await response.json()) as T;
    },
  };
}
