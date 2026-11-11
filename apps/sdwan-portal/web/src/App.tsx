import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { AlertsPage } from './pages/AlertsPage';
import { ChangeRequestDetailPage } from './pages/ChangeRequestDetailPage';
import { ChangeRequestsPage } from './pages/ChangeRequestsPage';
import { EdgeDetailPage } from './pages/EdgeDetailPage';
import { FirewallPage } from './pages/FirewallPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PoliciesPage } from './pages/PoliciesPage';

const NOT_PERMITTED = <p>Your role does not include access to this area.</p>;

export function App() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="edges/:edgeId" element={<EdgeDetailPage />} />
        <Route
          path="policies"
          element={
            <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN']} fallback={NOT_PERMITTED}>
              <PoliciesPage />
            </RequireRole>
          }
        />
        <Route
          path="firewall"
          element={
            <RequireRole roles={['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN']} fallback={NOT_PERMITTED}>
              <FirewallPage />
            </RequireRole>
          }
        />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="changes" element={<ChangeRequestsPage />} />
        <Route path="changes/:changeId" element={<ChangeRequestDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
