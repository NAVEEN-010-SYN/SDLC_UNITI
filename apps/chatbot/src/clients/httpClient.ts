import { DownstreamError } from '../domain/errors';
import { Logger } from '../logger';

/**
 * Minimal JSON HTTP client for downstream platform APIs.
 * - Propagates X-Correlation-Id and the caller's bearer token.
 * - Applies a per-attempt timeout and retries idempotent requests with
 *   exponential backoff + jitter on network errors, 5xx and 429.
 */

export interface RequestContext {
  correlationId: string;
  bearerToken?: string;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type Fetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<HttpResponse>;

export interface HttpClientOptions {
  serviceName: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  logger: Logger;
  fetcher?: Fetcher;
  /** Injected for tests so backoff does not slow the suite. */
  sleep?: (ms: number) => Promise<void>;
}

const IDEMPOTENT = new Set(['GET', 'PUT', 'DELETE', 'HEAD']);

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelay(attempt: number, baseMs = 150, capMs = 2000, random: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

export class HttpClient {
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpClientOptions) {
    this.fetcher = options.fetcher ?? (globalThis.fetch as unknown as Fetcher);
    this.sleep = options.sleep ?? defaultSleep;
  }

  get<T>(path: string, ctx: RequestContext, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, ctx, undefined, query);
  }

  post<T>(path: string, ctx: RequestContext, body: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('POST', path, ctx, body, undefined, idempotencyKey);
  }

  async request<T>(
    method: string,
    path: string,
    ctx: RequestContext,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-Id': ctx.correlationId,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (ctx.bearerToken) headers.Authorization = `Bearer ${ctx.bearerToken}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const canRetry = IDEMPOTENT.has(method) || idempotencyKey !== undefined;
    const maxAttempts = canRetry ? this.options.retries + 1 : 1;
    let lastError: DownstreamError | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await this.sleep(backoffDelay(attempt - 1));
      const started = Date.now();
      try {
        const response = await this.withTimeout((signal) =>
          this.fetcher(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal }),
        );
        this.options.logger.debug('downstream call', {
          service: this.options.serviceName,
          method,
          path,
          status: response.status,
          durationMs: Date.now() - started,
          attempt,
          correlationId: ctx.correlationId,
        });
        if (response.ok) {
          return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
        }
        lastError = new DownstreamError(this.options.serviceName, response.status, await this.describe(response));
        if (!lastError.retryable) throw lastError;
      } catch (error) {
        if (error instanceof DownstreamError && !error.retryable) throw error;
        lastError =
          error instanceof DownstreamError
            ? error
            : new DownstreamError(this.options.serviceName, undefined, error instanceof Error ? error.message : String(error));
        this.options.logger.warn('downstream attempt failed', {
          service: this.options.serviceName,
          method,
          path,
          attempt,
          error: lastError.message,
          correlationId: ctx.correlationId,
        });
      }
    }
    throw lastError ?? new DownstreamError(this.options.serviceName, undefined, 'request failed');
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.append(key, String(value));
    }
    const qs = params.toString();
    return `${base}${suffix}${qs ? `?${qs}` : ''}`;
  }

  private async withTimeout<R>(run: (signal: AbortSignal) => Promise<R>): Promise<R> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      return await run(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`timed out after ${this.options.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async describe(response: HttpResponse): Promise<string> {
    try {
      const problem = (await response.json()) as { title?: string; detail?: string };
      return problem.detail ?? problem.title ?? `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
}
