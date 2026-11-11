import { describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '../test/fakes';
import { ApiClient, buildUrl } from './apiClient';
import { ApiError, userMessage } from './problem';

function client(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof ApiClient>[0]> = {}) {
  return new ApiClient({
    baseUrl: '/api/v1',
    timeoutMs: 1000,
    getAccessToken: async () => 'tok-1',
    getAccountId: () => 'ACC-12345678',
    fetchImpl,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe('ApiClient', () => {
  it('sends auth, account and correlation headers and parses JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }));
    const result = await client(fetchImpl).get('/notifications', { query: { page: 1, pageSize: 20, unreadOnly: undefined } });

    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/notifications?page=1&pageSize=20');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['X-Account-Id']).toBe('ACC-12345678');
    expect(headers['X-Correlation-Id']).toMatch(/^uce-[0-9a-f-]{36}$/);
  });

  it('surfaces RFC 7807 problems with field errors and the server correlation id', async () => {
    const problem = { type: 'https://errors.uniti.example/x/validation-failed', title: 'Request validation failed', status: 400, errors: [{ field: 'text', message: 'must not be empty' }] };
    const fetchImpl = vi.fn(async () => jsonResponse(problem, { status: 400, contentType: 'application/problem+json', headers: { 'X-Correlation-Id': 'srv-123' } }));

    const error = await client(fetchImpl).post('/consents', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.correlationId).toBe('srv-123');
    expect(apiError.fieldErrors()).toEqual({ text: 'must not be empty' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('wraps non-problem error bodies (e.g. proxy HTML) into a synthetic problem', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
    const error = (await client(fetchImpl).get('/search').catch((e: unknown) => e)) as ApiError;
    expect(error.problem).toMatchObject({ type: 'about:blank', status: 404, instance: '/search' });
  });

  it('retries idempotent requests on 503 with the same correlation id', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ title: 'Service unavailable', status: 503 }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(client(fetchImpl).get('/feature-flags')).resolves.toEqual({ ok: true });
    const ids = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['X-Correlation-Id']);
    expect(ids[0]).toBe(ids[1]);
  });

  it('does not retry non-idempotent POSTs unless an idempotency key is supplied', async () => {
    const unavailable = () => jsonResponse({ title: 'Service unavailable', status: 503 }, { status: 503 });
    const plain = vi.fn(async () => unavailable());
    await expect(client(plain).post('/referrals/token')).rejects.toBeInstanceOf(ApiError);
    expect(plain).toHaveBeenCalledTimes(1);

    const keyed = vi.fn(async () => unavailable());
    await expect(client(keyed).post('/orders', {}, { idempotencyKey: 'k-1' })).rejects.toBeInstanceOf(ApiError);
    expect(keyed).toHaveBeenCalledTimes(3);
    expect((keyed.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }])[1].headers['Idempotency-Key']).toBe('k-1');
  });

  it('notifies on 401 so the shell can re-authenticate', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse({ title: 'Unauthorized', status: 401 }, { status: 401 }));
    await expect(client(fetchImpl, { onUnauthorized }).get('/notifications')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to status 0 and keeps the message user-safe', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await client(fetchImpl, { retries: 0 }).get('/search').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0 });
    expect(userMessage(error)).toBe('We could not reach Uniti. Check your connection and try again.');
  });

  it('omits the Authorization header for anonymous calls and handles 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetchImpl, { getAccessToken: async () => undefined }).post('/notifications/read-all')).resolves.toBeUndefined();
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }])[1].headers.Authorization).toBeUndefined();
  });

  it('builds URLs without double slashes', () => {
    expect(buildUrl('/api/v1', 'search', { q: 'a b' })).toBe('/api/v1/search?q=a+b');
  });
});
