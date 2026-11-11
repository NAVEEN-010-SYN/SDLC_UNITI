import { UpstreamProblem, UpstreamTimeoutProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import { currentCorrelationId } from '../../logging/logger';
import { backoffDelay, CircuitBreaker, parseRetryAfter, sleep } from './backoff';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  vendor: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  logger: Logger;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  random?: () => number;
  breaker?: CircuitBreaker;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Whether the request may be retried. Defaults to true for GET and for POSTs the
   * caller marks idempotent (VCO read methods and JSON-RPC "get" are POSTs).
   */
  idempotent?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  data: T;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * JSON HTTP client shared by the vendor clients: per-attempt timeout via AbortController,
 * retry with full-jitter exponential backoff (honouring Retry-After), a circuit breaker,
 * correlation-id propagation and structured logging of every upstream call.
 */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  readonly breaker: CircuitBreaker;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleepImpl = opts.sleepImpl ?? sleep;
    this.breaker = opts.breaker ?? new CircuitBreaker();
  }

  buildUrl(path: string, query?: RequestOptions['query']): string {
    const base = this.opts.baseUrl.replace(/\/+$/, '');
    const url = new URL(base + (path.startsWith('/') ? path : `/${path}`));
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async request<T>(req: RequestOptions): Promise<HttpResponse<T>> {
    const method = req.method ?? 'GET';
    const idempotent = req.idempotent ?? method === 'GET';
    const maxAttempts = idempotent ? this.opts.maxRetries + 1 : 1;
    const url = this.buildUrl(req.path, req.query);
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!this.breaker.canRequest()) {
        throw new UpstreamProblem(
          this.opts.vendor,
          `circuit open after repeated failures; retry in ${Math.ceil(this.breaker.retryInMs() / 1000)}s`,
          true,
        );
      }
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method,
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(currentCorrelationId() ? { 'X-Correlation-Id': currentCorrelationId()! } : {}),
            ...this.opts.defaultHeaders,
            ...req.headers,
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        });
        clearTimeout(timer);
        const elapsedMs = Date.now() - started;
        this.opts.logger.debug('upstream call', { vendor: this.opts.vendor, method, path: req.path, status: res.status, elapsedMs, attempt });

        if (res.ok) {
          this.breaker.recordSuccess();
          const text = await res.text();
          return { status: res.status, headers: res.headers, data: (text ? JSON.parse(text) : undefined) as T };
        }

        const bodyText = await res.text().catch(() => '');
        const retryable = RETRYABLE_STATUS.has(res.status);
        if (res.status >= 500) this.breaker.recordFailure();
        lastError = new UpstreamProblem(
          this.opts.vendor,
          `${method} ${req.path} returned HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
          retryable,
          res.status,
        );
        if (!retryable || attempt === maxAttempts - 1) throw lastError;
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
        await this.sleepImpl(retryAfter ?? this.delay(attempt));
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof UpstreamProblem && (!err.retryable || attempt === maxAttempts - 1)) throw err;
        if (err instanceof UpstreamProblem) {
          lastError = err;
          continue;
        }
        this.breaker.recordFailure();
        const aborted = (err as Error)?.name === 'AbortError';
        lastError = aborted
          ? new UpstreamTimeoutProblem(this.opts.vendor, this.opts.timeoutMs)
          : new UpstreamProblem(this.opts.vendor, `${method} ${req.path} failed: ${(err as Error)?.message ?? err}`, true);
        this.opts.logger.warn('upstream call failed', { vendor: this.opts.vendor, path: req.path, attempt, aborted });
        if (attempt === maxAttempts - 1) throw lastError;
        await this.sleepImpl(this.delay(attempt));
      }
    }
    throw lastError ?? new UpstreamProblem(this.opts.vendor, 'request failed');
  }

  private delay(attempt: number): number {
    return backoffDelay(attempt, { baseMs: this.opts.backoffBaseMs, maxMs: this.opts.backoffMaxMs, random: this.opts.random });
  }
}
