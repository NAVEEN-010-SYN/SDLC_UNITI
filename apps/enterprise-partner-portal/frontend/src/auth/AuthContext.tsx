import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '../config';
import type { Role } from '../api/types';
import {
  beginLogin, completeLogin, endSession, isExpired, loadTokens, saveTokens, userFromToken,
  type SessionUser, type TokenSet,
} from './oidc';

export interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
  user?: SessionUser;
  error?: string;
  accessToken: () => string | undefined;
  hasAnyRole: (...roles: Role[]) => boolean;
  login: (returnTo?: string) => void;
  logout: () => void;
  sessionExpired: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<TokenSet | undefined>(() => loadTokens());
  const [status, setStatus] = useState<AuthState['status']>(() => (window.location.pathname === '/callback'
    ? 'loading' : loadTokens() ? 'authenticated' : 'anonymous'));
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (window.location.pathname !== '/callback') {
      return;
    }
    const { oidcAuthority, oidcClientId } = config();
    completeLogin(oidcAuthority, oidcClientId, window.location.search)
      .then(({ tokens: fresh, returnTo }) => {
        saveTokens(fresh);
        setTokens(fresh);
        setStatus('authenticated');
        window.history.replaceState(null, '', returnTo);
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!tokens) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      saveTokens(undefined);
      setTokens(undefined);
      setStatus('anonymous');
    }, Math.max(0, tokens.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [tokens]);

  const user = useMemo(() => {
    if (!tokens) {
      return undefined;
    }
    const { rolesClaim, partnerClaim } = config();
    return userFromToken(tokens.accessToken, rolesClaim, partnerClaim);
  }, [tokens]);

  const login = useCallback((returnTo?: string) => {
    const { oidcAuthority, oidcClientId, oidcScope } = config();
    const target = returnTo ?? window.location.pathname + window.location.search;
    beginLogin(oidcAuthority, oidcClientId, oidcScope, target).catch((e: Error) => {
      setError(e.message);
      setStatus('error');
    });
  }, []);

  const logout = useCallback(() => {
    const { oidcAuthority, oidcClientId } = config();
    void endSession(oidcAuthority, oidcClientId, tokens?.idToken);
  }, [tokens]);

  const value = useMemo<AuthState>(() => ({
    status,
    user,
    error,
    accessToken: () => (tokens && !isExpired(tokens) ? tokens.accessToken : undefined),
    hasAnyRole: (...roles) => !!user && roles.some((r) => user.roles.includes(r)),
    login,
    logout,
    sessionExpired: () => {
      saveTokens(undefined);
      setTokens(undefined);
      setStatus('anonymous');
    },
  }), [status, user, error, tokens, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Lets tests and storybook-style harnesses supply a fixed auth state. */
export const AuthTestProvider = AuthContext.Provider;
