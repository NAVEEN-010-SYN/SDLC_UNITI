import { createContext, ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { segmentOf } from '../auth/roles';
import { UceConfig } from '../config';
import { useConsent } from '../consent/ConsentProvider';
import { AnalyticsService, pageTypeFor } from './analyticsService';
import { ClarityAdapter } from './clarityAdapter';
import { FullStoryAdapter } from './fullstoryAdapter';
import { hashIdentifier } from './pii';
import { AnalyticsAdapter } from './types';

export const AnalyticsContext = createContext<AnalyticsService | undefined>(undefined);

export function buildAdapters(config: UceConfig['analytics']): AnalyticsAdapter[] {
  const adapters: AnalyticsAdapter[] = [];
  if (config.clarityProjectId) adapters.push(new ClarityAdapter({ projectId: config.clarityProjectId }));
  if (config.fullstoryOrgId) adapters.push(new FullStoryAdapter({ orgId: config.fullstoryOrgId, host: config.fullstoryHost }));
  return adapters;
}

interface AnalyticsProviderProps {
  config: UceConfig['analytics'];
  adapters?: AnalyticsAdapter[];
  children: ReactNode;
}

/** Wires the analytics service to consent, the signed-in user and route changes. */
export function AnalyticsProvider({ config, adapters, children }: AnalyticsProviderProps) {
  const consent = useConsent();
  const { user, activeAccountId } = useAuth();
  const location = useLocation();
  const isGranted = useRef(consent.isGranted);
  isGranted.current = consent.isGranted;

  const service = useMemo(
    () =>
      new AnalyticsService(adapters ?? buildAdapters(config), {
        isGranted: (category) => isGranted.current(category),
        onAdapterError: (adapter, error) => console.warn(JSON.stringify({ level: 'warn', message: 'analytics adapter error', adapter, error: String(error) })),
      }),
    [adapters, config],
  );

  useEffect(() => {
    void service.syncConsent();
  }, [service, consent.record]);

  const hadUser = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      if (hadUser.current) service.reset();
      hadUser.current = false;
      return undefined;
    }
    hadUser.current = true;
    // Only salted hashes of the user and account ids ever reach vendors.
    const identifyUser = async () => {
      const accountHash = activeAccountId ? hashIdentifier(activeAccountId, config.idSalt) : Promise.resolve(undefined);
      const [userKey, accountKey] = await Promise.all([hashIdentifier(user.userId, config.idSalt), accountHash]);
      if (!cancelled) service.identify({ userKey, accountKey, segment: segmentOf(user.roles), roles: user.roles });
    };
    void identifyUser();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, config.idSalt, service, user]);

  useEffect(() => {
    const portal = /^\/portals\/([^/]+)/.exec(location.pathname)?.[1];
    service.page({ path: location.pathname, pageType: pageTypeFor(location.pathname), portal });
  }, [location.pathname, service]);

  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsService {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) throw new Error('useAnalytics must be used inside <AnalyticsProvider>');
  return ctx;
}
