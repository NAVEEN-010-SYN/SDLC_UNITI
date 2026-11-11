import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { Spinner } from './ui';

export function Layout() {
  const { user, isAuthenticated, isBusiness, logout } = useAuth();
  const { itemCount } = useCart();
  const brand = isBusiness ? 'Business GoKinetic' : 'GoKinetic';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="header">
        <Link to="/" className="header__brand">{brand}</Link>
        <nav aria-label="Main">
          <NavLink to="/plans">Plans</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          {isBusiness && <NavLink to="/business/quotes">Quotes</NavLink>}
          {isAuthenticated && <NavLink to="/account">My account</NavLink>}
          <NavLink to="/cart" aria-label={`Cart, ${itemCount} items`}>
            Cart{itemCount > 0 && <span className="header__count">{itemCount}</span>}
          </NavLink>
          {isAuthenticated ? (
            <button type="button" className="btn btn--link" onClick={logout}>
              Sign out {user.firstName}
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <p>Prices exclude taxes unless shown. Speeds are maximum line rates; Wi-Fi speeds vary.</p>
      </footer>
    </div>
  );
}

/**
 * Guards a route: waits for session restore, sends anonymous users to
 * sign-in (returning afterwards) and optionally requires a segment/role.
 * The server enforces the same rules; this only avoids dead-end pages.
 */
export function ProtectedRoute({ children, segment, roles }) {
  const { status, user, hasRole } = useAuth();
  const location = useLocation();
  if (status === 'restoring') return <Spinner label="Restoring your session" />;
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if ((segment && user.segment !== segment) || (roles && !hasRole(...roles))) {
    return <Navigate to="/account" replace />;
  }
  return children;
}
