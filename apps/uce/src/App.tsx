import { useCallback, useMemo } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { ApiProvider, useApi } from './api/ApiProvider';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { OidcClient } from './auth/oidc';
import { RequireAuth } from './auth/RequireAuth';
import { UceConfig } from './config';
import { ConsentProvider } from './consent/ConsentProvider';
import { ConsentRecord } from './consent/consentModel';
import { FeatureFlagProvider, useFeatureFlag } from './flags/featureFlags';
import { CallbackPage, HomePage, NotFoundPage } from './pages/pages';
import { ReferralPage } from './referrals/ReferralPage';
import { ReferralService } from './referrals/referralService';
import { AppShell } from './shell/AppShell';
import { PortalPage } from './shell/PortalPage';

/** Provider order matters: auth -> api -> consent (audited via api) -> flags -> analytics. */
export function App({ config }: { config: UceConfig }) {
  const oidc = useMemo(() => new OidcClient(config.oidc), [config.oidc]);
  return (
    <BrowserRouter>
      <AuthProvider client={oidc}>
        <ApiProvider baseUrl={config.apiBaseUrl} timeoutMs={config.apiTimeoutMs}>
          <ConsentedApp config={config} />
        </ApiProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function ConsentedApp({ config }: { config: UceConfig }) {
  const api = useApi();
  const { status } = useAuth();
  const audit = useCallback(
    async (record: ConsentRecord) => {
      // Anonymous decisions stay local; signed-in decisions are recorded server-side as evidence.
      if (status === 'authenticated') await api.post('/consents', record);
    },
    [api, status],
  );
  return (
    <ConsentProvider policyVersion={config.consentPolicyVersion} onDecision={audit}>
      <FeatureFlagProvider api={api} overrides={config.flagOverrides}>
        <AnalyticsProvider config={config.analytics}>
          <AppRoutes config={config} />
        </AnalyticsProvider>
      </FeatureFlagProvider>
    </ConsentProvider>
  );
}

function AppRoutes({ config }: { config: UceConfig }) {
  const api = useApi();
  const referralsEnabled = useFeatureFlag('referrals');
  const referrals = useMemo(
    () => new ReferralService({ api, tenantAlias: config.referrals.tenantAlias, widgetType: config.referrals.widgetType }),
    [api, config.referrals.tenantAlias, config.referrals.widgetType],
  );

  return (
    <Routes>
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route element={<AppShell portalUrls={config.portalUrls} />}>
        <Route
          index
          element={
            <RequireAuth>
              <HomePage portalUrls={config.portalUrls} />
            </RequireAuth>
          }
        />
        <Route
          path="portals/:portalId/*"
          element={
            <RequireAuth>
              <PortalPage portalUrls={config.portalUrls} />
            </RequireAuth>
          }
        />
        {referralsEnabled && (
          <Route
            path="referrals"
            element={
              <RequireAuth roles={['CONSUMER', 'BUSINESS_ADMIN']}>
                <ReferralPage service={referrals} shareBaseUrl={config.referrals.shareBaseUrl} />
              </RequireAuth>
            }
          />
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
