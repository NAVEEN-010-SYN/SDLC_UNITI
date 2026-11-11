import { describe, expect, it, vi } from 'vitest';
import { buildUrl, createApiClient } from './client';
import { ProblemError } from './problem';

function jsonResponse(status: number, body: unknown, contentType = 'application/json', headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType, ...headers } });
}

function client(fetchImpl: typeof fetch, onUnauthorized = vi.fn()) {
  return {
    onUnauthorized,
    api: createApiClient({
      baseUrl: 'https://api.example',
      getAccessToken: () => 'tok-123',
      onUnauthorized,
      fetchImpl,
      newCorrelationId: () => 'corr-0001-abcd',
    }),
  };
}

describe('buildUrl', () => {
  it('drops empty query values and encodes the rest', () => {
    expect(buildUrl('', '/api/v1/leads', { status: 'NEW', q: 'a&b', page: 2, mine: undefined, x: '' }))
      .toBe('/api/v1/leads?status=NEW&q=a%26b&page=2');
  });
});

describe('createApiClient', () => {
  it('sends bearer token, correlation id and JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'q-1' }));
    const { api } = client(fetchImpl);

    const result = await api.request<{ id: string }>('/api/v1/quotes', { method: 'POST', body: { a: 1 } });

    expect(result.id).toBe('q-1');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example/api/v1/quotes');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok-123',
      'X-Correlation-Id': 'corr-0001-abcd',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"a":1}');
  });

  it('turns problem+json into a ProblemError with field errors and rule details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(422, {
      status: 422,
      detail: 'The quote cannot be submitted as priced',
      code: 'quote.not_quotable',
      correlationId: 'server-corr',
      blockers: ['1 line(s) priced below the floor price'],
      errors: [{ field: 'customerName', message: 'must not be blank' }],
    }, 'application/problem+json'));
    const { api } = client(fetchImpl);

    const error = await api.request('/api/v1/quotes/x/submit', { method: 'POST' }).catch((e) => e);

    expect(error).toBeInstanceOf(ProblemError);
    expect(error.code).toBe('quote.not_quotable');
    expect(error.correlationId).toBe('server-corr');
    expect(error.listDetail('blockers')).toEqual(['1 line(s) priced below the floor price']);
    expect(error.fieldErrors).toEqual({ customerName: 'must not be blank' });
  });

  it('falls back to the response correlation header for non-JSON failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Bad gateway', {
      status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html', 'x-correlation-id': 'edge-1' },
    }));
    const { api } = client(fetchImpl);

    const error = await api.request('/api/v1/leads').catch((e) => e);

    expect(error.status).toBe(502);
    expect(error.code).toBe('http.502');
    expect(error.correlationId).toBe('edge-1');
  });

  it('notifies the auth layer on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { status: 401, code: 'auth.unauthenticated' },
      'application/problem+json'));
    const { api, onUnauthorized } = client(fetchImpl);

    await expect(api.request('/api/v1/leads')).rejects.toBeInstanceOf(ProblemError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('returns undefined for 204 responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const { api } = client(fetchImpl);

    await expect(api.request('/api/v1/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
