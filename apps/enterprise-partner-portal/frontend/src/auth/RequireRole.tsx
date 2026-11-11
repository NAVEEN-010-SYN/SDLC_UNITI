import type { ReactNode } from 'react';
import type { Role } from '../api/types';
import { useAuth } from './AuthContext';

interface Props {
  roles: Role[];
  children: ReactNode;
  /** Rendered instead of the children when the user lacks every listed role. */
  fallback?: ReactNode;
}

/**
 * Hides UI the caller is not entitled to. This is a usability measure only: the API enforces
 * every role check server-side and answers 403 regardless of what the UI shows.
 */
export function RequireRole({ roles, children, fallback = null }: Props) {
  const { hasAnyRole } = useAuth();
  return <>{hasAnyRole(...roles) ? children : fallback}</>;
}

export function Forbidden() {
  return (
    <section className="panel" role="alert">
      <h2>Not available</h2>
      <p>Your role does not give access to this page. Ask your partner administrator if you need it.</p>
    </section>
  );
}
