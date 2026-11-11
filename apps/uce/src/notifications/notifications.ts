import { ApiClient, Page } from '../api/apiClient';

export type NotificationCategory = 'BILLING' | 'ORDER' | 'TICKET' | 'OUTAGE' | 'REFERRAL' | 'SYSTEM';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
  /** Relative in-shell path, e.g. /portals/uconnect/tickets/TKT-0001234. */
  link?: string;
}

export interface NotificationState {
  items: AppNotification[];
  unread: number;
}

export type NotificationAction =
  | { type: 'loaded'; items: AppNotification[]; unread: number }
  | { type: 'read'; id: string; at: string }
  | { type: 'allRead'; at: string };

/** Pure reducer; optimistic read-marking keeps the badge responsive. */
export function notificationsReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'loaded':
      return { items: sortNotifications(action.items), unread: action.unread };
    case 'read': {
      const target = state.items.find((n) => n.id === action.id);
      if (!target || target.readAt) return state;
      return {
        items: state.items.map((n) => (n.id === action.id ? { ...n, readAt: action.at } : n)),
        unread: Math.max(0, state.unread - 1),
      };
    }
    case 'allRead':
      return { items: state.items.map((n) => (n.readAt ? n : { ...n, readAt: action.at })), unread: 0 };
    default:
      return state;
  }
}

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

/** Unread critical items first (e.g. outages), then newest first. */
export function sortNotifications(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => {
    const aUrgent = !a.readAt && a.severity === 'CRITICAL' ? 0 : 1;
    const bUrgent = !b.readAt && b.severity === 'CRITICAL' ? 0 : 1;
    return aUrgent - bUrgent || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt);
  });
}

/** Only in-shell relative links are followed, never arbitrary URLs from payloads. */
export function safeLink(link: string | undefined): string | undefined {
  return link && link.startsWith('/') && !link.startsWith('//') ? link : undefined;
}

export class NotificationService {
  constructor(private readonly api: ApiClient) {}

  async load(pageSize = 20): Promise<{ items: AppNotification[]; unread: number }> {
    const [page, count] = await Promise.all([
      this.api.get<Page<AppNotification>>('/notifications', { query: { page: 1, pageSize } }),
      this.api.get<{ unread: number }>('/notifications/unread-count'),
    ]);
    return { items: page.items, unread: count.unread };
  }

  markRead(id: string): Promise<void> {
    return this.api.post<void>(`/notifications/${encodeURIComponent(id)}/read`);
  }

  markAllRead(): Promise<void> {
    return this.api.post<void>('/notifications/read-all');
  }
}
