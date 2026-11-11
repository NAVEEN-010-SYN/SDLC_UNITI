import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { UceConfig } from '../config';
import { embedUrl, portalsFor } from './portals';

interface PortalMessage {
  type: 'uce:navigate' | 'uce:title';
  path?: string;
  title?: string;
}

/** Hosts an embeddable portal in a sandboxed frame, scoped to the active account. */
export function PortalPage({ portalUrls }: { portalUrls: UceConfig['portalUrls'] }) {
  const { portalId, '*': rest = '' } = useParams();
  const { user, activeAccountId } = useAuth();
  const navigate = useNavigate();
  const portal = useMemo(() => (user ? portalsFor(user.roles, portalUrls).find((p) => p.id === portalId) : undefined), [portalId, portalUrls, user]);
  // The frame URL is fixed per portal/account: later path changes come *from* the
  // frame (uce:navigate) and must not reload it. `rest` is read only on entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frameSrc = useMemo(() => (portal ? embedUrl(portal, rest, activeAccountId) : ''), [portal, activeAccountId]);

  useEffect(() => {
    if (!portal) return undefined;
    const origin = new URL(portal.url).origin;
    // Accept messages only from the portal's own origin; ignore everything else.
    const onMessage = (event: MessageEvent<PortalMessage>) => {
      if (event.origin !== origin || !event.data || typeof event.data !== 'object') return;
      // Keeps the shell URL in sync with in-portal navigation so deep links and back/forward work.
      if (event.data.type === 'uce:navigate' && typeof event.data.path === 'string' && /^\/[\w\-/]*$/.test(event.data.path)) {
        navigate(`/portals/${portal.id}${event.data.path}`, { replace: true });
      }
      if (event.data.type === 'uce:title' && typeof event.data.title === 'string') document.title = `${event.data.title.slice(0, 80)} - Uniti`;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate, portal]);

  if (!portal) {
    return (
      <section role="alert">
        <h1>Portal unavailable</h1>
        <p>This portal doesn't exist or isn't available for your account.</p>
      </section>
    );
  }

  if (portal.mode === 'link') {
    return (
      <section>
        <h1>{portal.name}</h1>
        <p>{portal.description}</p>
        <a href={embedUrl(portal, rest, activeAccountId)} target="_blank" rel="noopener noreferrer">
          Open {portal.name} in a new tab
        </a>
      </section>
    );
  }

  return (
    <iframe
      key={`${portal.id}-${activeAccountId}`}
      title={portal.name}
      src={frameSrc}
      className="uce-portal-frame"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
