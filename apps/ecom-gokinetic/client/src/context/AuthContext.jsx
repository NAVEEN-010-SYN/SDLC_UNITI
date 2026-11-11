import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import { createEndpoints } from '../api/endpoints';

/**
 * Session state and the authenticated API.
 *
 * The access token lives only in memory. The rotating refresh token is kept
 * in sessionStorage (cleared when the tab closes) so a reload does not sign
 * the shopper out; it is never put in localStorage.
 */

const REFRESH_KEY = 'gk.refresh';
const AuthContext = createContext(null);

function readRefreshToken() {
  try {
    return window.sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token) {
  try {
    if (token) window.sessionStorage.setItem(REFRESH_KEY, token);
    else window.sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Storage disabled (private mode): the session simply ends on reload.
  }
}

export function AuthProvider({ children, baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1', fetchImpl }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(readRefreshToken() ? 'restoring' : 'anonymous');
  const accessToken = useRef(null);

  const applySession = useCallback((session) => {
    accessToken.current = session.accessToken;
    writeRefreshToken(session.refreshToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    accessToken.current = null;
    writeRefreshToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  // The refresh call itself must bypass the 401-retry logic, so it uses a
  // bare client with no token.
  const { api, endpoints } = useMemo(() => {
    const bare = createEndpoints(createApiClient({ baseUrl, fetchImpl }));
    const client = createApiClient({
      baseUrl,
      fetchImpl,
      getAccessToken: () => accessToken.current,
      refreshSession: async () => {
        const refreshToken = readRefreshToken();
        if (!refreshToken) return false;
        try {
          applySession(await bare.auth.refresh(refreshToken));
          return true;
        } catch {
          clearSession();
          return false;
        }
      },
    });
    return { api: client, endpoints: createEndpoints(client) };
  }, [baseUrl, fetchImpl, applySession, clearSession]);

  useEffect(() => {
    const refreshToken = readRefreshToken();
    if (!refreshToken) return;
    endpoints.auth
      .refresh(refreshToken)
      .then(applySession)
      .catch(clearSession);
    // Restore once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (credentials) => applySession(await endpoints.auth.login(credentials)), [endpoints, applySession]);
  const register = useCallback(async (details) => applySession(await endpoints.auth.register(details)), [endpoints, applySession]);
  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken();
    clearSession();
    if (refreshToken) await endpoints.auth.logout(refreshToken).catch(() => {});
  }, [endpoints, clearSession]);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isBusiness: Boolean(user && user.segment === 'BUSINESS'),
      hasRole: (...roles) => Boolean(user && user.roles.some((r) => roles.includes(r))),
      login,
      register,
      logout,
      api,
      endpoints,
    }),
    [user, status, login, register, logout, api, endpoints],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
