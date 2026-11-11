import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiClient } from '../api/apiClient';
import { AuthContext, AuthContextValue } from '../auth/AuthProvider';
import { SessionUser } from '../auth/oidc';
import { hasAnyRole } from '../auth/roles';

export function testUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'user-1',
    name: 'Jane Customer',
    roles: ['CONSUMER'],
    accounts: [{ accountId: 'ACC-12345678', name: 'Home' }],
    defaultAccountId: 'ACC-12345678',
    ...overrides,
  };
}

export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const user = overrides.user ?? testUser();
  return {
    status: 'authenticated',
    user,
    activeAccountId: user.defaultAccountId,
    login: vi.fn(async () => undefined),
    completeLogin: vi.fn(async () => '/'),
    logout: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => 'token'),
    setActiveAccount: vi.fn(),
    hasRole: (...roles) => hasAnyRole(user.roles, roles),
    ...overrides,
  };
}

export function Providers({ auth = fakeAuth(), path = '/', children }: { auth?: AuthContextValue; path?: string; children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </MemoryRouter>
  );
}

/** ApiClient double whose get/post are vi mocks keyed by path. */
export function fakeApi(responses: Record<string, unknown> = {}) {
  const resolve = (path: string) => {
    if (!(path in responses)) return Promise.reject(new Error(`unexpected call ${path}`));
    const value = responses[path];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  };
  return {
    get: vi.fn((path: string) => resolve(path)),
    post: vi.fn((path: string) => resolve(path)),
  } as unknown as ApiClient & { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
}

export function jsonResponse(body: unknown, init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': init.contentType ?? 'application/json', ...init.headers },
  });
}
