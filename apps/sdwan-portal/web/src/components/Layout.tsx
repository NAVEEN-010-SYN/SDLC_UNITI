import { FormEvent, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { humanize } from '../lib/format';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/policies', label: 'Business policies' },
  { to: '/firewall', label: 'Firewall' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/changes', label: 'Change requests' },
];

function AccountPicker() {
  const { setAccountId, accountId } = useAuth();
  const [value, setValue] = useState(accountId ?? '');
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAccountId(value.trim().toUpperCase());
  };
  return (
    <form onSubmit={onSubmit} className="account-picker">
      <label htmlFor="account">Account</label>
      <input id="account" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ACC-00000000" pattern="ACC-\d{8}" />
      <button type="submit">Open</button>
    </form>
  );
}

export function Layout() {
  const { user, accountId, signOut } = useAuth();
  return (
    <div className="shell">
      <header>
        <span className="brand">Uniti Business · SD-WAN</span>
        {user && !user.accountId && <AccountPicker />}
        {user && (
          <span className="who">
            {user.userId} · {user.roles.map(humanize).join(', ')}
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </span>
        )}
      </header>
      {accountId ? (
        <>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <main>
            <Outlet />
          </main>
        </>
      ) : (
        <main>
          <p>Select an account to manage its SD-WAN estate.</p>
        </main>
      )}
    </div>
  );
}
