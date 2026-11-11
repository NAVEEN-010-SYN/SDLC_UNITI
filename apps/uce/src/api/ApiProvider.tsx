import { createContext, ReactNode, useContext, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { ApiClient } from './apiClient';

export const ApiContext = createContext<ApiClient | undefined>(undefined);

interface ApiProviderProps {
  baseUrl: string;
  timeoutMs: number;
  children: ReactNode;
}

/** One ApiClient for the whole shell, always using the current token and active account. */
export function ApiProvider({ baseUrl, timeoutMs, children }: ApiProviderProps) {
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        timeoutMs,
        getAccessToken: () => authRef.current.getAccessToken(),
        getAccountId: () => authRef.current.activeAccountId,
        onUnauthorized: () => void authRef.current.login(),
      }),
    [baseUrl, timeoutMs],
  );

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used inside <ApiProvider>');
  return ctx;
}
