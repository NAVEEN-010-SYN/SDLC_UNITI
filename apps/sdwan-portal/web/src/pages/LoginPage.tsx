import { FormEvent, useState } from 'react';
import { authorizeUrl, useAuth } from '../auth/AuthContext';

/**
 * Production sign-in redirects to the IdP (implicit flow; the token comes back in the URL
 * fragment and AuthProvider picks it up). In development a token can be pasted directly,
 * e.g. one minted by the API's signDevToken helper.
 */
export function LoginPage() {
  const { signIn } = useAuth();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const idp = authorizeUrl(window.location.origin + window.location.pathname);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(signIn(raw.trim()) ? null : 'That token is malformed, expired or carries no SD-WAN portal role.');
  };

  return (
    <main className="login">
      <h1>Uniti Business SD-WAN</h1>
      {idp && (
        <a className="button" href={idp}>
          Sign in with your Uniti account
        </a>
      )}
      {import.meta.env.DEV && (
        <form onSubmit={onSubmit}>
          <label>
            Developer access token
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={4} />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button type="submit">Use token</button>
        </form>
      )}
    </main>
  );
}
