import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Alert, ChangeRequestView } from '../api/types';
import { mockFetch, renderAt } from '../test/utils';
import { AlertsPage } from './AlertsPage';
import { ChangeRequestDetailPage } from './ChangeRequestDetailPage';

const ACC = '/api/v1/accounts/ACC-10000001';

const alert: Alert = {
  id: 'ALR-1',
  edgeId: 'vc-1001-hq-edge-1',
  type: 'LINK_DOWN',
  severity: 'MAJOR',
  status: 'OPEN',
  message: 'hq-edge-1 link GE4 (BROADBAND) is down',
  occurrences: 3,
  raisedAt: '2026-03-02T09:00:00Z',
  lastSeenAt: '2026-03-02T10:00:00Z',
};

describe('AlertsPage', () => {
  it('lists open alerts and acknowledges in place', async () => {
    const fetch = mockFetch((url, init) => {
      if (url.pathname === `${ACC}/alerts`) return { body: { items: [alert], page: 1, pageSize: 25, total: 1 } };
      if (url.pathname === `${ACC}/alerts/ALR-1/acknowledge` && init.method === 'POST') {
        return { body: { ...alert, status: 'ACKNOWLEDGED', acknowledgedBy: 'u-user' } };
      }
      return undefined;
    });
    renderAt(<AlertsPage />, { path: '/alerts', route: '/alerts', user: { sub: 'u-user', roles: ['BUSINESS_USER'] } });

    expect(await screen.findByText(alert.message)).toBeInTheDocument();
    expect(new URL(String(fetch.mock.calls[0][0]), 'http://x').searchParams.get('status')).toBe('OPEN');
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(await screen.findByText('Acknowledged by u-user')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });

  it('hides acknowledge for read-only partner agents', async () => {
    mockFetch((url) => (url.pathname === `${ACC}/alerts` ? { body: { items: [alert], page: 1, pageSize: 25, total: 1 } } : undefined));
    renderAt(<AlertsPage />, { path: '/alerts', route: '/alerts', user: { sub: 'p', roles: ['PARTNER_AGENT'] } });
    await screen.findByText(alert.message);
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
  });
});

const cr: ChangeRequestView = {
  id: 'CR-1',
  title: 'Reboot head office',
  type: 'EDGE_REBOOT',
  edgeIds: ['vc-1001-hq-edge-1'],
  payload: { type: 'EDGE_REBOOT' },
  risk: 'MEDIUM',
  riskReasons: ['EDGE_REBOOT base risk 4'],
  emergency: false,
  status: 'SUBMITTED',
  requestedBy: 'u-user',
  approvals: [],
  results: [],
  history: [{ at: '2026-03-02T09:00:00Z', by: 'u-user', from: null, to: 'DRAFT' }],
  createdAt: '2026-03-02T09:00:00Z',
  updatedAt: '2026-03-02T09:00:00Z',
  approvalPolicy: { requiredApprovals: 1, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: true },
  outstanding: ['1 more approval(s)', 'an approval from BUSINESS_ADMIN'],
};

describe('ChangeRequestDetailPage', () => {
  const route = { path: '/changes/:changeId', route: '/changes/CR-1' };

  it('lets an administrator approve and requires a comment to reject', async () => {
    const fetch = mockFetch((url, init) => {
      if (url.pathname === `${ACC}/change-requests/CR-1`) return { body: cr };
      if (url.pathname === `${ACC}/change-requests/CR-1/decisions`) {
        expect(JSON.parse(String(init.body))).toEqual({ decision: 'APPROVE' });
        return { body: { ...cr, status: 'APPROVED', outstanding: [] } };
      }
      if (url.pathname === `${ACC}/maintenance-windows/upcoming`) return { body: [] };
      return undefined;
    });
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-admin', roles: ['BUSINESS_ADMIN'] } });

    expect(await screen.findByText(/Still required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'nope' } });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('Schedule')).toBeInTheDocument());
    expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/decisions'))).toBe(true);
    expect(await screen.findByText(/No maintenance windows open/)).toBeInTheDocument();
  });

  it('explains why a business user cannot approve', async () => {
    mockFetch((url) => (url.pathname === `${ACC}/change-requests/CR-1` ? { body: cr } : undefined));
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-peer', roles: ['BUSINESS_USER'] } });
    expect(await screen.findByText('Only business administrators can approve changes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('shows the problem detail and reference when the approval is refused', async () => {
    mockFetch((url) => {
      if (url.pathname === `${ACC}/change-requests/CR-1`) return { body: cr };
      if (url.pathname.endsWith('/decisions')) {
        return { status: 409, body: { type: 'x/conflict', title: 'Conflict', status: 409, detail: 'Change request is APPROVED and cannot move to APPROVED', correlationId: 'srv-42' } };
      }
      return undefined;
    });
    renderAt(<ChangeRequestDetailPage />, { ...route, user: { sub: 'u-admin', roles: ['BUSINESS_ADMIN'] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cannot move to APPROVED');
    expect(screen.getByText('Reference: srv-42')).toBeInTheDocument();
  });
});
