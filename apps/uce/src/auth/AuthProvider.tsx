import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, remove, safeStorage, writeJson } from '../lib/storage';
import { AuthTransaction, OidcClient, Session, sessionFromTokens, SessionUser } from './oidc';
import { hasAnyRole, Role } from './roles';

/**
 * Unified auth/session context for every portal hosted by the shell.
 * Tokens live in sessionStorage (cleared with the tab); refresh is single-flight
 * so concurrent API calls never race two refresh-token grants.
 */

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user?: SessionUser;
  activeAccountId?: string;
  login(returnTo?: string): Promise<void>;
  /** Completes the redirect callback; resolves to the path to return to. */
  completeLogin(search: string): Promise<string>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | undefined>;
  setActiveAccount(accountId: string): void;
  hasRole(...roles: Role[]): boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEY = 'uce.session';
const TX_KEY = 'uce.oidc.tx';
const ACCOUNT_KEY = 'uce.activeAccount';
/** Refresh this long before expiry to absorb clock skew and in-flight latency. */
const REFRESH_SKEW_MS = 60_000;

function isSession(v: unknown): v is Session {
  if (!v || typeof v !== 'object') return false;
  const candidate = v as Session;
  return typeof candidate.tokens?.accessToken === 'string' && typeof candidate.user?.userId === 'string';
}
const isTransaction = (v: unknown): v is AuthTransaction => !!v && typeof (v as AuthTransaction).state === 'string';
const isString = (v: unknown): v is string => typeof v === 'string';

export function resolveActiveAccount(user: SessionUser, preferred: string | undefined): string {
  return preferred && user.accounts.some((a) => a.accountId === preferred) ? preferred : user.defaultAccountId;
}

interface AuthProviderProps {
  client: OidcClient;
  children: ReactNode;
  navigate?: (url: string) => void;
  now?: () => number;
}

export function AuthProvider({ client, children, navigate = (url) => window.location.assign(url), now = Date.now }: AuthProviderProps) {
  const storage = safeStorage('sessionStorage');
  const [session, setSession] = useState<Session | undefined>();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [activeAccountId, setActiveAccountId] = useState<string | undefined>();
  const sessionRef = useRef<Session | undefined>();
  const refreshing = useRef<Promise<string | undefined> | null>(null);

  const adopt = useCallback(
    (next: Session | undefined) => {
      sessionRef.current = next;
      setSession(next);
      if (next) {
        writeJson(storage, SESSION_KEY, next);
        setActiveAccountId(resolveActiveAccount(next.user, readJson(storage, ACCOUNT_KEY, isString)));
        setStatus('authenticated');
      } else {
        remove(storage, SESSION_KEY);
        remove(storage, ACCOUNT_KEY);
        setActiveAccountId(undefined);
        setStatus('anonymous');
      }
    },
    [storage],
  );

  useEffect(() => {
    const stored = readJson(storage, SESSION_KEY, isSession);
    const usable = stored && (stored.tokens.expiresAt > now() || stored.tokens.refreshToken);
    adopt(usable ? stored : undefined);
  }, [adopt, now, storage]);

  const getAccessToken = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return undefined;
    if (current.tokens.expiresAt - REFRESH_SKEW_MS > now()) return current.tokens.accessToken;
    if (!current.tokens.refreshToken) {
      adopt(undefined);
      return undefined;
    }
    const refreshToken = current.tokens.refreshToken;
    const runRefresh = async (): Promise<string | undefined> => {
      try {
        const next = sessionFromTokens(await client.refresh(refreshToken));
        adopt(next);
        return next.tokens.accessToken;
      } catch {
        adopt(undefined);
        return undefined;
      }
    };
    // Single-flight: concurrent callers share one refresh grant.
    refreshing.current ??= runRefresh().finally(() => {
      refreshing.current = null;
    });
    return refreshing.current;
  }, [adopt, client, now]);

  const login = useCallback(
    async (returnTo = `${window.location.pathname}${window.location.search}`) => {
      const { url, transaction } = await client.beginLogin(returnTo);
      writeJson(storage, TX_KEY, transaction);
      navigate(url);
    },
    [client, navigate, storage],
  );

  const completeLogin = useCallback(
    async (search: string) => {
      const transaction = readJson(storage, TX_KEY, isTransaction);
      remove(storage, TX_KEY);
      const tokens = await client.completeLogin(search, transaction);
      adopt(sessionFromTokens(tokens));
      // Only same-origin relative paths are honoured to prevent open redirects.
      const target = transaction?.returnTo ?? '/';
      return target.startsWith('/') && !target.startsWith('//') ? target : '/';
    },
    [adopt, client, storage],
  );

  const logout = useCallback(async () => {
    const idToken = sessionRef.current?.tokens.idToken;
    adopt(undefined);
    const url = await client.logoutUrl(idToken).catch(() => undefined);
    navigate(url ?? '/');
  }, [adopt, client, navigate]);

  const setActiveAccount = useCallback(
    (accountId: string) => {
      const user = sessionRef.current?.user;
      if (!user || !user.accounts.some((a) => a.accountId === accountId)) return;
      writeJson(storage, ACCOUNT_KEY, accountId);
      setActiveAccountId(accountId);
    },
    [storage],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user,
      activeAccountId,
      login,
      completeLogin,
      logout,
      getAccessToken,
      setActiveAccount,
      hasRole: (...roles) => !!session && hasAnyRole(session.user.roles, roles),
    }),
    [activeAccountId, completeLogin, getAccessToken, login, logout, session, setActiveAccount, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
