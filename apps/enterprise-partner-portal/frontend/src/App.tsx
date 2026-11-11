import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ApiProvider } from './api/ApiContext';
import type { Role } from './api/types';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Forbidden, RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { CatalogPage } from './pages/CatalogPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { LeadsPage } from './pages/LeadsPage';
import { QuoteBuilderPage } from './pages/QuoteBuilderPage';
import { QuotesPage } from './pages/QuotesPage';
import { TeamPage } from './pages/TeamPage';

const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];
const ADMIN: Role[] = ['PARTNER_ADMIN'];

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  return <RequireRole roles={roles} fallback={<Forbidden />}>{children}</RequireRole>;
}

/** Sends anonymous users to the IdP and holds rendering until the session is known. */
function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, login } = useAuth();
  useEffect(() => {
    if (status === 'anonymous') {
      login();
    }
  }, [status, login]);
  if (status === 'error') {
    return (
      <section className="panel" role="alert">
        <h2>Sign-in failed</h2>
        <p>{error}</p>
        <button type="button" onClick={() => login('/')}>Try again</button>
      </section>
    );
  }
  if (status !== 'authenticated') {
    return <p className="loading">Signing you in…</p>;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Guard roles={PARTNER}><DashboardPage /></Guard>} />
        <Route path="leads" element={<Guard roles={PARTNER}><LeadsPage /></Guard>} />
        <Route path="deals" element={<Guard roles={PARTNER}><DealsPage /></Guard>} />
        <Route path="quotes" element={<Guard roles={PARTNER}><QuotesPage /></Guard>} />
        <Route path="quotes/new" element={<Guard roles={PARTNER}><QuoteBuilderPage /></Guard>} />
        <Route path="catalog" element={<Guard roles={PARTNER}><CatalogPage /></Guard>} />
        <Route path="commissions" element={<Guard roles={ADMIN}><CommissionsPage /></Guard>} />
        <Route path="team" element={<Guard roles={ADMIN}><TeamPage /></Guard>} />
        <Route path="callback" element={<Navigate to="/" replace />} />
        <Route path="*" element={<section className="panel"><h2>Page not found</h2></section>} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SessionGate>
          <ApiProvider>
            <AppRoutes />
          </ApiProvider>
        </SessionGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
