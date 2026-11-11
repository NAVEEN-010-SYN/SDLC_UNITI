import { NavLink, Outlet } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];
const ADMIN: Role[] = ['PARTNER_ADMIN'];

export const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', roles: PARTNER },
  { to: '/leads', label: 'Leads', roles: PARTNER },
  { to: '/deals', label: 'Deals', roles: PARTNER },
  { to: '/quotes', label: 'Quotes', roles: PARTNER },
  { to: '/catalog', label: 'Catalog', roles: PARTNER },
  { to: '/commissions', label: 'Commissions', roles: ADMIN },
  { to: '/team', label: 'Team', roles: ADMIN },
];

export function Layout() {
  const { user, hasAnyRole, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <strong>Uniti Partner Portal</strong>
        <nav aria-label="Main">
          {NAV.filter((n) => hasAnyRole(...n.roles)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="topbar__user">
          <span>{user?.name}</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
