import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { renderWithApp } from '../test/harness';
import { RequireRole } from './RequireRole';

describe('role gating', () => {
  it('renders children only for permitted roles', () => {
    renderWithApp(<RequireRole roles={['PARTNER_ADMIN']} fallback={<p>nope</p>}><p>secret</p></RequireRole>,
      { roles: ['PARTNER_AGENT'] });

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByText('nope')).toBeInTheDocument();
  });

  it('hides admin navigation from agents', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_AGENT'], route: '/catalog', api: { catalog: { list: async () => [] } } });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toHaveTextContent('Leads');
    expect(nav).not.toHaveTextContent('Commissions');
    expect(nav).not.toHaveTextContent('Team');
  });

  it('blocks agents who navigate directly to an admin page', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_AGENT'], route: '/commissions' });

    expect(screen.getByRole('alert')).toHaveTextContent('Not available');
  });

  it('shows admin navigation to partner admins', () => {
    renderWithApp(<AppRoutes />, { roles: ['PARTNER_ADMIN'], route: '/catalog', api: { catalog: { list: async () => [] } } });

    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveTextContent('Team');
  });
});
