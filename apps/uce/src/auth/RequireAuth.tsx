import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Role } from './roles';

interface RequireAuthProps {
  roles?: Role[];
  children: ReactNode;
}

/**
 * Route guard: sends anonymous visitors to sign-in (returning to the same path)
 * and shows an explanation, not a blank page, when the role is insufficient.
 * Authorisation is still enforced by every API; this only shapes navigation.
 */
export function RequireAuth({ roles = [], children }: RequireAuthProps) {
  const { status, login, hasRole } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'anonymous') void login(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, login, status]);

  if (status !== 'authenticated') {
    return (
      <p role="status" className="uce-loading">
        Signing you in...
      </p>
    );
  }
  if (roles.length > 0 && !hasRole(...roles)) {
    return (
      <section className="uce-forbidden" aria-labelledby="forbidden-title">
        <h1 id="forbidden-title">You don't have access to this area</h1>
        <p>Ask your account administrator to grant you access, or switch to an account where you have the right role.</p>
      </section>
    );
  }
  return <>{children}</>;
}
