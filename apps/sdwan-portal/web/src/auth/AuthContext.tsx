import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import { sdwanApi, SdwanApi } from '../api/sdwan';
import type { Role } from '../api/types';
import { decodeSession, SessionUser, tokenFromFragment } from './token';

const STORAGE_KEY = 'sdwan.token';

interface AuthState {
  user: SessionUser | null;
  /** Account the UI is acting on: the user's own, or the one a support agent / partner picked. */
  accountId: string | null;
  setAccountId: (id: string) => void;
  api: SdwanApi | null;
  signIn: (token: string) => boolean;
  signOut: () => void;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredToken(): string | null {
  try {
    const fromFragment = tokenFromFragment(window.location.hash);
    if (fromFragment) {
      sessionStorage.setItem(STORAGE_KEY, fromFragment);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return fromFragment;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function authorizeUrl(returnTo: string): string | null {
  const base = import.meta.env.VITE_OIDC_AUTHORIZE_URL as string | undefined;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set('client_id', (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) ?? 'sdwan-portal');
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('redirect_uri', returnTo);
  return url.toString();
}

export function AuthProvider({ children, initialToken }: { children: ReactNode; initialToken?: string }) {
  const [token, setToken] = useState<string | null>(() => initialToken ?? readStoredToken());
  const user = useMemo(() => (token ? decodeSession(token) : null), [token]);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const signOut = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setPickedAccount(null);
  }, []);

  const signIn = useCallback((raw: string) => {
    if (!decodeSession(raw)) return false;
    sessionStorage.setItem(STORAGE_KEY, raw);
    setToken(raw);
    return true;
  }, []);

  // Drop the session when the token expires instead of letting every request 401.
  useEffect(() => {
    if (!user) return;
    const t = window.setTimeout(signOut, Math.max(0, user.expiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [user, signOut]);

  const accountId = user?.accountId ?? pickedAccount ?? user?.partnerAccountIds[0] ?? null;

  const api = useMemo(() => {
    if (!user || !accountId) return null;
    const client = createApiClient({ baseUrl: '/api/v1', getToken: () => tokenRef.current, onUnauthorized: signOut });
    return sdwanApi(client, accountId);
  }, [user, accountId, signOut]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      accountId,
      setAccountId: (id) => {
        if (user && !user.accountId && /^ACC-\d{8}$/.test(id)) setPickedAccount(id);
      },
      api,
      signIn,
      signOut,
      hasRole: (...roles) => !!user?.roles.some((r) => roles.includes(r)),
    }),
    [user, accountId, api, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For pages rendered only once an account is selected (guaranteed by the router). */
export function useApi(): SdwanApi {
  const { api } = useAuth();
  if (!api) throw new Error('No account selected');
  return api;
}

/** Hides children unless the user holds one of `roles`. UX only: the API enforces the same rule. */
export function RequireRole({ roles, children, fallback = null }: { roles: Role[]; children: ReactNode; fallback?: ReactNode }) {
  const { hasRole } = useAuth();
  return <>{hasRole(...roles) ? children : fallback}</>;
}
