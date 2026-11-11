import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PricingPreview, Product, QuoteRequest } from '../api/types';
import { renderWithApp } from '../test/harness';
import { QuoteBuilderPage, toQuoteRequest, type QuoteDraft } from './QuoteBuilderPage';

const fibre: Product = {
  id: 'p1', sku: 'FBB-BUS-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500,
  monthlyPriceMinor: 5500, installPriceMinor: 9900, minTermMonths: 12, perSite: true, currency: 'GBP',
};

const draft: QuoteDraft = {
  customerName: 'Northwind', customerAccountId: '', customerContactEmail: 'it@northwind.example', termMonths: 36,
  discount: '12.5', justification: '', lines: [{ sku: 'FBB-BUS-500', siteName: 'HQ', sitePostcode: 'LS1 4AP', quantity: 1 }],
};

function preview(overrides: Partial<PricingPreview> = {}): PricingPreview {
  return {
    listMrcMinor: 5500, termDiscountMinor: 550, volumeDiscountMinor: 0, partnerDiscountMinor: 619, netMrcMinor: 4331,
    nrcMinor: 0, nrcWaived: true, totalContractValueMinor: 155916, termDiscountPercent: 10, volumeDiscountPercent: 0,
    effectiveDiscountPercent: 21.255, selfApprovedAllowancePercent: 5, approvalLevel: 'CHANNEL_MANAGER', blockers: [],
    currency: 'GBP', ...overrides,
  };
}

describe('toQuoteRequest', () => {
  it('builds a trimmed request with a numeric discount', () => {
    const { request, problems } = toQuoteRequest({ ...draft, customerName: '  Northwind ' });

    expect(problems).toEqual([]);
    expect(request).toMatchObject({ customerName: 'Northwind', requestedDiscountPercent: 12.5, customerAccountId: undefined });
  });

  it('lists everything that blocks pricing', () => {
    const { request, problems } = toQuoteRequest({
      ...draft, customerContactEmail: 'nope', customerAccountId: 'ACC-1', discount: '12.3456',
      lines: [{ sku: 'X', siteName: '', sitePostcode: '1', quantity: 0 }],
    });

    expect(request).toBeUndefined();
    expect(problems).toEqual([
      'Enter a valid customer email',
      'Account ID must look like ACC-12345678',
      'Discount must be a percentage with up to three decimals',
      'Line 1: enter a site name',
      'Line 1: enter a valid postcode',
      'Line 1: quantity 1-100',
    ]);
  });
});

describe('QuoteBuilderPage', () => {
  it('previews pricing, requires a justification above the allowance, then submits for approval', async () => {
    const previewCall = vi.fn(async (_body: QuoteRequest) => preview());
    const create = vi.fn(async (_body: QuoteRequest) => ({ id: 'q-1' }));
    const submit = vi.fn(async () => ({ id: 'q-1', status: 'PENDING_APPROVAL' }));
    renderWithApp(<QuoteBuilderPage />, {
      route: '/quotes/new?customer=Northwind',
      api: {
        catalog: { list: async () => [fibre] },
        quotes: { preview: previewCall, create, submit } as never,
      },
    });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Customer email'), 'it@northwind.example');
    await user.clear(screen.getByLabelText('Partner discount (%)'));
    await user.type(screen.getByLabelText('Partner discount (%)'), '12.5');
    await user.selectOptions(await screen.findByLabelText('Add product'), 'FBB-BUS-500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Site name'), 'HQ');
    await user.type(screen.getByLabelText('Postcode'), 'LS1 4AP');

    expect(await screen.findByText('Channel manager required', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(previewCall.mock.calls.at(-1)?.[0]).toMatchObject({ termMonths: 36, requestedDiscountPercent: 12.5 });
    const submitButton = screen.getByRole('button', { name: 'Submit for approval' });
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText('Justification for Uniti approvers'), 'Incumbent price match');
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => expect(submit).toHaveBeenCalledWith('q-1'));
    expect(create.mock.calls[0][0]).toMatchObject({ customerName: 'Northwind', justification: 'Incumbent price match' });
  });

  it('shows blockers from the pricing engine and refuses to submit', async () => {
    renderWithApp(<QuoteBuilderPage />, {
      route: '/quotes/new?customer=Northwind',
      api: {
        catalog: { list: async () => [fibre] },
        quotes: { preview: async () => preview({ approvalLevel: 'NONE', blockers: ['1 line(s) priced below the floor price'] }) } as never,
      },
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Customer email'), 'it@northwind.example');
    await user.selectOptions(await screen.findByLabelText('Add product'), 'FBB-BUS-500');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('Site name'), 'HQ');
    await user.type(screen.getByLabelText('Postcode'), 'LS1 4AP');

    expect(await screen.findByText('1 line(s) priced below the floor price', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save & approve' })).toBeDisabled();
  });
});
