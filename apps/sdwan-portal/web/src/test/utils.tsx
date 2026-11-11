import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import type { Role } from '../api/types';
import { AuthProvider } from '../auth/AuthContext';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Unsigned JWT with the claim layout the IdP issues; the UI never verifies signatures. */
export function fakeToken(claims: { sub: string; roles: Role[]; accountId?: string; exp?: number }): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.sig`;
}

type Handler = (url: URL, init: RequestInit) => { status?: number; body?: unknown } | undefined;

/** Routes fetch calls to `handler`; unmatched calls fail the test loudly. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const reply = handler(url, init);
    if (!reply) throw new Error(`unmocked ${init.method ?? 'GET'} ${url.pathname}`);
    const status = reply.status ?? 200;
    const problem = status >= 400;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status,
      headers: { 'Content-Type': problem ? 'application/problem+json' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderAt(ui: ReactElement, opts: { path: string; route: string; user: { sub: string; roles: Role[]; accountId?: string } }) {
  return render(
    <AuthProvider initialToken={fakeToken({ accountId: 'ACC-10000001', ...opts.user })}>
      <MemoryRouter initialEntries={[opts.route]}>
        <Routes>
          <Route path={opts.path} element={ui} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}
