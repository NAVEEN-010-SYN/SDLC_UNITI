import { DownstreamError } from '../domain/errors';
import { silentLogger } from '../logger';
import { backoffDelay, Fetcher, HttpClient, HttpResponse } from './httpClient';

function response(status: number, body: unknown = {}): HttpResponse {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
}

function client(fetcher: Fetcher, retries = 2) {
  return new HttpClient({
    serviceName: 'billing',
    baseUrl: 'https://billing.test/api/v1/',
    timeoutMs: 1000,
    retries,
    logger: silentLogger,
    fetcher,
    sleep: async () => undefined,
  });
}

const ctx = { correlationId: 'corr-1', bearerToken: 'tok' };

describe('HttpClient', () => {
  it('builds URLs with query params and propagates headers', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(200, { ok: 1 }));
    await client(fetcher).get('/invoices', ctx, { page: 1, pageSize: 5, status: undefined });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://billing.test/api/v1/invoices?page=1&pageSize=5');
    expect(init.headers['X-Correlation-Id']).toBe('corr-1');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('retries idempotent requests on 503 then succeeds', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { value: 42 }));
    await expect(client(fetcher).get<{ value: number }>('/x', ctx)).resolves.toEqual({ value: 42 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry client errors', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(404, { detail: 'no such invoice' }));
    await expect(client(fetcher).get('/x', ctx)).rejects.toThrow('no such invoice');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-idempotent POST without an idempotency key', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(500));
    await expect(client(fetcher).post('/tickets', ctx, { a: 1 })).rejects.toBeInstanceOf(DownstreamError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries POST when an idempotency key is supplied', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => response(500));
    await expect(client(fetcher, 2).post('/tickets', ctx, { a: 1 }, 'key-1')).rejects.toBeInstanceOf(DownstreamError);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('key-1');
  });

  it('wraps network errors as retryable downstream errors', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(client(fetcher, 1).get('/x', ctx)).rejects.toThrow('billing: ECONNRESET');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('computes bounded jittered backoff', () => {
    expect(backoffDelay(0, 100, 1000, () => 0)).toBe(50);
    expect(backoffDelay(3, 100, 1000, () => 1)).toBe(800);
    expect(backoffDelay(10, 100, 1000, () => 1)).toBe(1000);
  });
});
