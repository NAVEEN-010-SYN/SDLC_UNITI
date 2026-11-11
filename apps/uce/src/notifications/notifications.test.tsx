import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../test/fakes';
import { NotificationCentre } from './NotificationCentre';
import { AppNotification, notificationsReducer, NotificationService, safeLink, sortNotifications } from './notifications';

const n = (id: string, overrides: Partial<AppNotification> = {}): AppNotification => ({
  id,
  category: 'BILLING',
  severity: 'INFO',
  title: `Title ${id}`,
  body: 'Body',
  createdAt: `2026-11-0${id}T10:00:00Z`,
  ...overrides,
});

describe('notification state', () => {
  it('puts unread critical items first, then newest', () => {
    const sorted = sortNotifications([n('1'), n('3'), n('2', { severity: 'CRITICAL', category: 'OUTAGE' }), n('4', { severity: 'CRITICAL', readAt: 'x' })]);
    expect(sorted.map((x) => x.id)).toEqual(['2', '4', '3', '1']);
  });

  it('marks one read idempotently and never goes below zero', () => {
    const start = notificationsReducer({ items: [], unread: 0 }, { type: 'loaded', items: [n('1'), n('2')], unread: 1 });
    const once = notificationsReducer(start, { type: 'read', id: '1', at: 'now' });
    expect(once.unread).toBe(0);
    expect(notificationsReducer(once, { type: 'read', id: '1', at: 'later' })).toBe(once);
    expect(notificationsReducer(once, { type: 'read', id: '2', at: 'now' }).unread).toBe(0);
  });

  it('marks all read', () => {
    const state = notificationsReducer({ items: [n('1'), n('2', { readAt: 'old' })], unread: 1 }, { type: 'allRead', at: 'now' });
    expect(state.unread).toBe(0);
    expect(state.items.map((x) => x.readAt)).toEqual(['now', 'old']);
  });

  it('only follows in-shell links', () => {
    expect(safeLink('/portals/uconnect/tickets/TKT-1')).toBe('/portals/uconnect/tickets/TKT-1');
    expect(safeLink('//evil.example/x')).toBeUndefined();
    expect(safeLink('javascript:alert(1)')).toBeUndefined();
  });
});

function Where() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('NotificationCentre', () => {
  it('shows the unread badge, marks an item read and navigates to its link', async () => {
    const service = {
      load: vi.fn(async () => ({ items: [n('1', { link: '/portals/uconnect/invoices/INV-00000001' })], unread: 1 })),
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => undefined),
    } as unknown as NotificationService;

    render(
      <Providers>
        <NotificationCentre service={service} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </Providers>,
    );
    expect(await screen.findByLabelText('1 unread')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByRole('button', { name: /Title 1/ }));

    expect(service.markRead).toHaveBeenCalledWith('1');
    expect(screen.queryByLabelText('1 unread')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/portals/uconnect/invoices/INV-00000001');
  });
});
