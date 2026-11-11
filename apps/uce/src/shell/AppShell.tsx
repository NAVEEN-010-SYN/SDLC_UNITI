import { useMemo } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AccountSwitcher } from '../accounts/AccountSwitcher';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { useApi } from '../api/ApiProvider';
import { useAuth } from '../auth/AuthProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { UceConfig } from '../config';
import { ConsentBanner } from '../consent/ConsentBanner';
import { useConsent } from '../consent/ConsentProvider';
import { Feature } from '../flags/featureFlags';
import { NotificationCentre } from '../notifications/NotificationCentre';
import { NotificationService } from '../notifications/notifications';
import { GlobalSearch } from '../search/GlobalSearch';
import { SearchService } from '../search/searchService';
import { portalsFor } from './portals';

export function AppShell({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const api = useApi();
  const analytics = useAnalytics();
  const consent = useConsent();
  const { status, user, login, logout } = useAuth();
  const location = useLocation();
  const notifications = useMemo(() => new NotificationService(api), [api]);
  const search = useMemo(() => new SearchService(api), [api]);
  const portals = user ? portalsFor(user.roles, portalUrls) : [];

  return (
    <div className="uce-shell">
      <a className="uce-skip" href="#uce-main">
        Skip to content
      </a>
      <header className="uce-header">
        <Link to="/" className="uce-brand">
          Uniti
        </Link>
        {user && (
          <nav aria-label="Portals">
            {portals.map((p) => (
              <NavLink key={p.id} to={`/portals/${p.id}`}>
                {p.name}
              </NavLink>
            ))}
            <Feature flag="referrals">
              <NavLink to="/referrals">Refer a friend</NavLink>
            </Feature>
          </nav>
        )}
        {user && (
          <Feature flag="global-search">
            <GlobalSearch service={search} onSearch={(count) => analytics.track('search_performed', { result_count: count })} />
          </Feature>
        )}
        {user && <AccountSwitcher onSwitch={() => analytics.track('account_switched', { accounts: user.accounts.length })} />}
        {user && <NotificationCentre service={notifications} />}
        {status === 'authenticated' ? (
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        ) : (
          status === 'anonymous' && (
            <button type="button" onClick={() => void login()}>
              Sign in
            </button>
          )
        )}
      </header>
      <main id="uce-main" className="uce-main">
        <ErrorBoundary resetKey={location.pathname} onError={(report) => analytics.track('ui_error', { error_name: report.name, reference: report.reference })}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="uce-footer">
        <button type="button" onClick={consent.openPreferences}>
          Cookie settings
        </button>
      </footer>
      <ConsentBanner />
    </div>
  );
}
