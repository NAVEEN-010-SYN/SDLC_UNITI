import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UceConfig } from '../config';
import { portalsFor } from '../shell/portals';

export function HomePage({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const { user } = useAuth();
  if (!user) return null;
  const portals = portalsFor(user.roles, portalUrls);
  const firstName = user.name?.split(' ')[0];
  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
      {portals.length === 0 ? (
        <p>No services are available for your role yet. Contact your account administrator.</p>
      ) : (
        <ul className="uce-tiles">
          {portals.map((p) => (
            <li key={p.id}>
              <Link to={`/portals/${p.id}`}>
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** OIDC redirect target. Runs the code exchange exactly once even under StrictMode. */
export function CallbackPage() {
  const { completeLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogin(location.search)
      .then((returnTo) => navigate(returnTo, { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed'));
  }, [completeLogin, location.search, navigate]);

  if (error) {
    return (
      <section role="alert">
        <h1>We couldn't sign you in</h1>
        <p>{error}</p>
        <Link to="/">Back to start</Link>
      </section>
    );
  }
  return <p role="status">Completing sign-in...</p>;
}

export function NotFoundPage() {
  return (
    <section>
      <h1>Page not found</h1>
      <Link to="/">Go to your dashboard</Link>
    </section>
  );
}
