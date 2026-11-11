import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createApiClient } from './client';

function respond(status: number, body: unknown, contentType = 'application/json', headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': contentType, ...headers } }));
}

const make = (fetchImpl: ReturnType<typeof respond>, onUnauthorized = vi.fn()) =>
  createApiClient({ baseUrl: '/api/v1', getToken: () => 'tok', onUnauthorized, fetchImpl: fetchImpl as unknown as typeof fetch, newId: () => 'cid-00000001' });

describe('buildQuery', () => {
  it('drops empty values and encodes the rest', () => {
    expect(buildQuery({ page: 2, q: 'a b', status: undefined, vendor: '' })).toBe('?page=2&q=a+b');
    expect(buildQuery({})).toBe('');
  });
});

describe('createApiClient', () => {
  it('sends bearer token, correlation id and JSON body', async () => {
    const f = respond(201, { id: 'CR-1' });
    await expect(make(f).post('/x', { a: 1 }, { query: { dry: true } })).resolves.toEqual({ id: 'CR-1' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/x?dry=true');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Correlation-Id': 'cid-00000001', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('raises problem+json errors with field errors and the server correlation id', async () => {
    const problem = { type: 'x/validation', title: 'Request validation failed', status: 400, correlationId: 'srv-1', errors: [{ path: 'title', message: 'too short' }] };
    const err = (await make(respond(400, problem, 'application/problem+json')).get('/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.correlationId).toBe('srv-1');
    expect(err.fieldErrors()).toEqual({ title: 'too short' });
  });

  it('normalises non-problem failures and signals 401s', async () => {
    const onUnauthorized = vi.fn();
    const err = (await make(respond(401, '<html>nope</html>', 'text/html', { 'X-Correlation-Id': 'echo-1' }), onUnauthorized).get('/x').catch((e) => e)) as ApiError;
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(err.problem.status).toBe(401);
    expect(err.correlationId).toBe('echo-1');
  });

  it('maps network failures to status 0 but lets aborts through', async () => {
    const network = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(make(network as never).get('/x')).rejects.toMatchObject({ status: 0 });
    const abort = vi.fn(async () => Promise.reject(new DOMException('aborted', 'AbortError')));
    await expect(make(abort as never).get('/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('returns undefined for 204', async () => {
    await expect(make(respond(204, null)).del('/x')).resolves.toBeUndefined();
  });
});
