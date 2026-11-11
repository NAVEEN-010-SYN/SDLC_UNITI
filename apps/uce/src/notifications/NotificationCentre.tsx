import { useCallback, useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/money';
import { AppNotification, notificationsReducer, NotificationService, safeLink } from './notifications';

interface NotificationCentreProps {
  service: NotificationService;
  pollIntervalMs?: number;
  now?: () => Date;
}

/** Bell with unread badge and a dropdown list; polls only while the tab is visible. */
export function NotificationCentre({ service, pollIntervalMs = 60_000, now = () => new Date() }: NotificationCentreProps) {
  const [state, dispatch] = useReducer(notificationsReducer, { items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      dispatch({ type: 'loaded', ...(await service.load()) });
    } catch {
      // Keep showing the last known list; the next poll retries.
    }
  }, [service]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, refresh]);

  const select = (notification: AppNotification) => {
    if (!notification.readAt) {
      dispatch({ type: 'read', id: notification.id, at: now().toISOString() });
      service.markRead(notification.id).catch(() => void refresh());
    }
    const link = safeLink(notification.link);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  };

  const markAll = () => {
    dispatch({ type: 'allRead', at: now().toISOString() });
    service.markAllRead().catch(() => void refresh());
  };

  return (
    <div className="uce-notifications">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        Notifications
        {state.unread > 0 && (
          <span className="uce-badge" aria-label={`${state.unread} unread`}>
            {state.unread > 99 ? '99+' : state.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="uce-notifications__panel">
          {state.unread > 0 && (
            <button type="button" onClick={markAll}>
              Mark all as read
            </button>
          )}
          {state.items.length === 0 ? (
            <p>You're all caught up.</p>
          ) : (
            <ul>
              {state.items.map((n) => (
                <li key={n.id} className={n.readAt ? 'is-read' : 'is-unread'} data-severity={n.severity}>
                  <button type="button" onClick={() => select(n)}>
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <time dateTime={n.createdAt}>{formatDate(n.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
