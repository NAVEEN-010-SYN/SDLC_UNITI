/**
 * HTTP client for the eCom API.
 *
 * - every request carries a fresh X-Correlation-Id so support can trace a
 *   shopper's action end-to-end; the server's echo is kept on errors
 * - RFC 7807 problem+json responses become ApiError instances with the
 *   field errors and business rule code preserved
 * - a 401 on an authenticated call triggers one refresh-and-retry; parallel
 *   401s share the same refresh so the rotating refresh token is used once
 */

export class ApiError extends Error {
  constructor({ status, type, title, detail, errors = [], code, correlationId, extensions = {} }) {
    super(detail || title || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.type = type;
    this.title = title;
    this.detail = detail;
    this.errors = errors;
    this.code = code;
    this.correlationId = correlationId;
    this.extensions = extensions;
  }

  /** Field errors keyed by path, e.g. { 'address.postalCode': 'Has an invalid format.' }. */
  get fieldErrors() {
    return Object.fromEntries(this.errors.map((e) => [e.path, e.message]));
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

export function newCorrelationId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Idempotency keys for unsafe POSTs: stable for one user action, unique across actions. */
export function newIdempotencyKey(prefix = 'web') {
  return `${prefix}-${newCorrelationId()}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
}

function buildQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function toApiError(response, correlationId) {
  const contentType = response.headers.get('Content-Type') || '';
  let body = null;
  try {
    body = contentType.includes('json') ? await response.json() : null;
  } catch {
    body = null;
  }
  const { type, title, detail, errors, code, status, correlationId: echoed, instance, ...extensions } = body || {};
  return new ApiError({
    status: response.status,
    type,
    title: title || response.statusText,
    detail,
    errors: Array.isArray(errors) ? errors : [],
    code,
    correlationId: echoed || response.headers.get('X-Correlation-Id') || correlationId,
    extensions,
  });
}

/**
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {() => string|null} [options.getAccessToken]
 * @param {() => Promise<boolean>} [options.refreshSession] resolves true when a new token is available
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createApiClient({
  baseUrl = '/api/v1',
  getAccessToken = () => null,
  refreshSession = async () => false,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  let refreshing = null;

  function sharedRefresh() {
    if (!refreshing) {
      refreshing = Promise.resolve(refreshSession()).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function send(method, path, { body, query, headers = {}, signal, auth = true }, allowRetry) {
    const correlationId = newCorrelationId();
    const token = auth ? getAccessToken() : null;
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}${buildQuery(query)}`, {
        method,
        signal,
        headers: {
          Accept: 'application/json, application/problem+json',
          'X-Correlation-Id': correlationId,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new ApiError({
        status: 0,
        title: 'Network error',
        detail: 'We could not reach GoKinetic. Check your connection and try again.',
        correlationId,
      });
    }

    if (response.status === 401 && token && allowRetry && (await sharedRefresh())) {
      return send(method, path, { body, query, headers, signal, auth }, false);
    }
    if (!response.ok) throw await toApiError(response, correlationId);
    if (response.status === 204) return { data: null, headers: response.headers };
    const text = await response.text();
    return { data: text ? JSON.parse(text) : null, headers: response.headers };
  }

  /** Returns just the parsed body. */
  const call = (method) => async (path, options = {}) => (await send(method, path, options, true)).data;

  return {
    get: call('GET'),
    post: call('POST'),
    put: call('PUT'),
    patch: call('PATCH'),
    delete: call('DELETE'),
    /** Full response (body + headers) for calls that need a header, e.g. X-Cart-Token. */
    raw: (method, path, options = {}) => send(method, path, options, true),
  };
}
