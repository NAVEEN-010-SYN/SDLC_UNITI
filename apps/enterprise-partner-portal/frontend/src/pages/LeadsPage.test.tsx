import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Deal, Lead, Page } from '../api/types';
import { renderWithApp } from '../test/harness';
import { groupByStage } from './DealsPage';
import { LeadsPage, NEXT_STEPS } from './LeadsPage';

const lead: Lead = {
  id: 'l-1', reference: 'LD-2026-000001', ownerSubject: 'u-1', companyName: 'Northwind Logistics',
  contactName: 'Ana', contactEmail: 'ana@northwind.example', postcode: 'LS1 4AP', siteCount: 4,
  estimatedMrcMinor: 125000, source: 'REFERRAL', status: 'QUALIFIED', score: 72, scoreBand: 'HOT',
  createdAt: '2026-11-01T09:00:00Z',
};

const page = (items: Lead[]): Page<Lead> => ({ items, page: 1, pageSize: 20, total: items.length });

describe('LeadsPage', () => {
  it('lists leads with money and score band, and filters by status via the URL', async () => {
    const search = vi.fn(async () => page([lead]));
    renderWithApp(<LeadsPage />, { api: { leads: { search } as never } });

    const row = (await screen.findByText('Northwind Logistics')).closest('tr')!;
    expect(within(row).getByText('£1,250.00')).toBeInTheDocument();
    expect(within(row).getByText('Hot')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'QUALIFIED');
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'QUALIFIED', page: 1 })));
  });

  it('converts a qualified lead into a deal and reports conflicts', async () => {
    const convert = vi.fn(async () => ({ dealId: 'd-1', dealReference: 'DR-2026-000007', dealStatus: 'UNDER_REVIEW' as const, hasConflict: true }));
    renderWithApp(<LeadsPage />, { api: { leads: { search: async () => page([lead]), convert } as never } });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Convert' }));
    await user.type(screen.getByLabelText('Company number'), 'ab123456');
    await user.click(screen.getByRole('button', { name: 'Register deal' }));

    expect(convert).toHaveBeenCalledWith('l-1', expect.objectContaining({ customerCompanyNumber: 'AB123456' }));
    expect(await screen.findByRole('status')).toHaveTextContent('DR-2026-000007 registered (Under review)');
    expect(screen.getByRole('status')).toHaveTextContent('overlapping claim');
  });

  it('only offers transitions the API allows', () => {
    expect(NEXT_STEPS.CONVERTED).toEqual([]);
    expect(NEXT_STEPS.QUALIFIED).not.toContain('CONVERTED');
  });
});

describe('groupByStage', () => {
  it('places every deal in exactly one column, grouping closed outcomes', () => {
    const deal = (id: string, status: Deal['status']) => ({ id, status } as Deal);
    const board = groupByStage([deal('a', 'SUBMITTED'), deal('b', 'APPROVED'), deal('c', 'LOST'), deal('d', 'EXPIRED')]);

    expect(board.get('Registered')!.map((d) => d.id)).toEqual(['a']);
    expect(board.get('Protected')!.map((d) => d.id)).toEqual(['b']);
    expect(board.get('Closed')!.map((d) => d.id)).toEqual(['c', 'd']);
  });
});
