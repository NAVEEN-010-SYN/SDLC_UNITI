'use strict';

const { currentCorrelationId, logger } = require('../config/logger');
const { UpstreamError } = require('../errors');

/**
 * Shared outbound HTTP client for upstream integrations.
 *
 * - per-request timeout via AbortController
 * - bounded retries with jittered exponential back-off on network errors,
 *   408/429/5xx (only for methods/calls flagged retryable)
 * - X-Correlation-Id propagation from the current request context
 * - a simple consecutive-failure circuit breaker so a dead dependency fails
 *   fast instead of tying up request threads
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function createCircuitBreaker({ failureThreshold = 5, resetAfterMs = 30000, now = () => Date.now() } = {}) {
  let failures = 0;
  let openedAt = null;
  return {
    /** @returns {'CLOSED'|'OPEN'|'HALF_OPEN'} */
    state() {
      if (openedAt === null) return 'CLOSED';
      return now() - openedAt >= resetAfterMs ? 'HALF_OPEN' : 'OPEN';
    },
    canRequest() {
      return this.state() !== 'OPEN';
    },
    recordSuccess() {
      failures = 0;
      openedAt = null;
    },
    recordFailure() {
      failures += 1;
      if (failures >= failureThreshold || this.state() === 'HALF_OPEN') openedAt = now();
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {string} options.name dependency name for errors/logs
 * @param {string} options.baseUrl
 * @param {Record<string,string>} [options.headers] default headers (auth)
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @param {number} [options.baseDelayMs]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.breaker]
 */
function createHttpClient({
  name,
  baseUrl,
  headers = {},
  timeoutMs = 5000,
  maxRetries = 2,
  baseDelayMs = 200,
  fetchImpl = globalThis.fetch,
  breaker = createCircuitBreaker(),
  log = logger,
}) {
  async function attempt(method, url, body, extraHeaders) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const correlationId = currentCorrelationId();
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}),
          ...headers,
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      return { status: response.status, ok: response.ok, data };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, headers?: object, retryable?: boolean, expectedStatuses?: number[] }} [opts]
   * @returns {Promise<{status:number, ok:boolean, data:any}>}
   *   Resolves for 2xx and for any status in `expectedStatuses` (e.g. 402 for
   *   declines); otherwise throws UpstreamError.
   */
  async function request(method, path, { body, headers: extraHeaders = {}, retryable, expectedStatuses = [] } = {}) {
    if (!breaker.canRequest()) {
      throw new UpstreamError(name, `${name} is temporarily unavailable (circuit open).`);
    }
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    const canRetry = retryable ?? ['GET', 'PUT', 'DELETE'].includes(method);
    let lastError;

    for (let i = 0; i <= (canRetry ? maxRetries : 0); i += 1) {
      if (i > 0) {
        const delay = baseDelayMs * 2 ** (i - 1) + Math.floor(Math.random() * baseDelayMs);
        await sleep(delay);
      }
      const started = Date.now();
      try {
        const res = await attempt(method, url, body, extraHeaders);
        log.debug('upstream.response', { dependency: name, method, path, status: res.status, ms: Date.now() - started });
        if (res.ok || expectedStatuses.includes(res.status)) {
          breaker.recordSuccess();
          return res;
        }
        lastError = new UpstreamError(name, `${name} responded with HTTP ${res.status}.`, res.status);
        if (!RETRYABLE_STATUS.has(res.status)) {
          if (res.status >= 500) breaker.recordFailure();
          throw lastError;
        }
      } catch (err) {
        if (err instanceof UpstreamError && !RETRYABLE_STATUS.has(err.upstreamStatus)) throw err;
        lastError =
          err instanceof UpstreamError
            ? err
            : new UpstreamError(
                name,
                err.name === 'AbortError' ? `${name} timed out after ${timeoutMs}ms.` : `${name} is unreachable.`,
              );
      }
      log.warn('upstream.retryable_failure', { dependency: name, method, path, attempt: i + 1, error: lastError.detail });
    }
    breaker.recordFailure();
    throw lastError;
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts = {}) => request('POST', path, { ...opts, body }),
    put: (path, body, opts = {}) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
    breaker,
  };
}

module.exports = { createHttpClient, createCircuitBreaker, RETRYABLE_STATUS };
