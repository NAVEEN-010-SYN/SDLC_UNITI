import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { config } from '../config';
import { createApiClient } from './client';
import { endpoints, type Endpoints } from './endpoints';

const ApiContext = createContext<Endpoints | undefined>(undefined);

export function ApiProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { accessToken, sessionExpired } = auth;
  const api = useMemo(() => endpoints(createApiClient({
    baseUrl: config().apiBaseUrl,
    getAccessToken: accessToken,
    onUnauthorized: sessionExpired,
  })), [accessToken, sessionExpired]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useEndpoints(): Endpoints {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useEndpoints must be used inside <ApiProvider>');
  }
  return ctx;
}

/** Lets tests inject stubbed endpoints. */
export const ApiTestProvider = ApiContext.Provider;
