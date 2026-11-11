import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiTestProvider } from '../api/ApiContext';
import type { Endpoints } from '../api/endpoints';
import type { Role } from '../api/types';
import { AuthTestProvider, type AuthState } from '../auth/AuthContext';

export function authState(roles: Role[], partnerId = 'p-1'): AuthState {
  return {
    status: 'authenticated',
    user: { subject: 'u-1', name: 'Test User', email: 'me@partner.example', partnerId, roles },
    accessToken: () => 'token',
    hasAnyRole: (...wanted) => wanted.some((r) => roles.includes(r)),
    login: vi.fn(),
    logout: vi.fn(),
    sessionExpired: vi.fn(),
  };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K] : DeepPartial<T[K]> };

/** Renders a page with a fake signed-in user and stubbed endpoints (unstubbed calls reject). */
export function renderWithApp(ui: ReactElement, opts: { roles?: Role[]; api?: DeepPartial<Endpoints>; route?: string } = {}) {
  const api = new Proxy(opts.api ?? {}, {
    get: (target, group: string) => new Proxy((target as Record<string, object>)[group] ?? {}, {
      get: (fns, name: string) => (fns as Record<string, unknown>)[name]
        ?? (() => Promise.reject(new Error(`Unexpected call ${group}.${name}`))),
    }),
  }) as Endpoints;
  return render(
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <AuthTestProvider value={authState(opts.roles ?? ['PARTNER_ADMIN'])}>
        <ApiTestProvider value={api}>{ui}</ApiTestProvider>
      </AuthTestProvider>
    </MemoryRouter>,
  );
}
