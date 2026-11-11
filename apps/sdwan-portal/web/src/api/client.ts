/** RFC 7807 body as returned by the API, including our extensions. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  correlationId?: string;
  errors?: Array<{ path: string; message: string }>;
  [extension: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly correlationId: string,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Field-level messages keyed by path, for showing next to form inputs. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.problem.errors ?? []).map((e) => [e.path, e.message]));
  }
}

export interface ClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
  fetchImpl?: typeof fetch;
  newId?: () => string;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export function buildQuery(query?: Query): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Thin fetch wrapper: attaches the bearer token and a fresh X-Correlation-Id per call,
 * and turns any non-2xx into an ApiError carrying the problem document. Non-problem error
 * bodies (proxy HTML, empty 502s) are normalised into a synthetic problem so callers only
 * ever handle one error shape.
 */
export function createApiClient(cfg: ClientConfig) {
  const doFetch = cfg.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const newId = cfg.newId ?? (() => crypto.randomUUID());

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const correlationId = newId();
    const headers: Record<string, string> = { Accept: 'application/json, application/problem+json', 'X-Correlation-Id': correlationId };
    const token = cfg.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}${path}${buildQuery(opts.query)}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError({ type: 'about:blank', title: 'Network error', status: 0, detail: 'The SD-WAN service could not be reached' }, correlationId);
    }

    const echoed = res.headers.get('X-Correlation-Id') ?? correlationId;
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get('Content-Type') ?? '';
    const isJson = /json/.test(contentType);
    const body = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      if (res.status === 401) cfg.onUnauthorized();
      const problem: ProblemDetails =
        isJson && body && typeof body === 'object' && 'status' in body
          ? (body as ProblemDetails)
          : { type: 'about:blank', title: res.statusText || 'Request failed', status: res.status };
      throw new ApiError(problem, problem.correlationId ?? echoed);
    }
    return body as T;
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body: body ?? {} }),
    put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
    del: (path: string, opts?: RequestOptions) => request<void>('DELETE', path, opts),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
