import { describe, expect, test, vi } from 'vitest';
import { ApiError, createApiClient, newIdempotencyKey } from './client';

const json = (status, body, headers = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers },
  });

describe('createApiClient', () => {
  test('sends a correlation id, bearer token and query string', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, { items: [] }));
    const api = createApiClient({ baseUrl: '/api/v1', fetchImpl, getAccessToken: () => 'tok' });
    await api.get('/products', { query: { segment: 'CONSUMER', search: '', skus: ['A', 'B'] } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/v1/products?segment=CONSUMER&skus=A%2CB');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-Correlation-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('turns problem+json into an ApiError with field errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(422, {
        type: 'https://errors.gokinetic.example/problems/business-rule-violation',
        title: 'Business rule violated',
        status: 422,
        detail: 'This promo code has expired.',
        code: 'PROMO_EXPIRED',
        correlationId: 'srv-123',
        errors: [{ path: 'code', message: 'Expired.' }],
      }),
    );
    const api = createApiClient({ fetchImpl });
    const error = await api.put('/carts/1/promo', { body: { code: 'OLD' } }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: 'PROMO_EXPIRED', correlationId: 'srv-123', detail: 'This promo code has expired.' });
    expect(error.fieldErrors).toEqual({ code: 'Expired.' });
  });

  test('refreshes once on 401 and retries; concurrent 401s share the refresh', async () => {
    let token = 'old';
    const refreshSession = vi.fn(async () => {
      token = 'new';
      return true;
    });
    const fetchImpl = vi.fn(async (_url, init) =>
      init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { status: 401, title: 'Unauthorized' }),
    );
    const api = createApiClient({ fetchImpl, getAccessToken: () => token, refreshSession });

    const results = await Promise.all([api.get('/orders'), api.get('/invoices')]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  test('gives up after one failed refresh', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { status: 401, title: 'Unauthorized' }));
    const api = createApiClient({ fetchImpl, getAccessToken: () => 'x', refreshSession: async () => false });
    await expect(api.get('/orders')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('network failures become status-0 errors', async () => {
    const api = createApiClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
    const error = await api.get('/health').catch((e) => e);
    expect(error.isNetworkError).toBe(true);
  });

  test('raw exposes response headers and 204 yields null', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(201, { id: 'c1' }, { 'X-Cart-Token': 'guest' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createApiClient({ fetchImpl });
    const { data, headers } = await api.raw('POST', '/carts', { body: { segment: 'CONSUMER' } });
    expect(data.id).toBe('c1');
    expect(headers.get('X-Cart-Token')).toBe('guest');
    expect(await api.post('/auth/logout', { body: {} })).toBeNull();
  });
});

test('idempotency keys satisfy the server pattern', () => {
  const key = newIdempotencyKey('order');
  expect(key).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  expect(newIdempotencyKey('order')).not.toBe(key);
});
