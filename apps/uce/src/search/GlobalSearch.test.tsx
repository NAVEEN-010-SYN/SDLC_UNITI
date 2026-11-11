import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../test/fakes';
import { GlobalSearch } from './GlobalSearch';
import { detectIdentifier, SearchResult, SearchService } from './searchService';

function Where() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function renderSearch(search: (q: string, signal?: AbortSignal) => Promise<SearchResult[]>, debounceMs = 5) {
  const service = { search: vi.fn(search) } as unknown as SearchService & { search: ReturnType<typeof vi.fn> };
  render(
    <Providers>
      <GlobalSearch service={service} debounceMs={debounceMs} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </Providers>,
  );
  return service;
}

const results: SearchResult[] = [
  { type: 'HELP', id: 'h1', title: 'Fixing slow wifi', path: '/help/slow-wifi' },
  { type: 'TICKET', id: 'TKT-0001234', title: 'Slow broadband ticket', path: '/portals/uconnect/tickets/TKT-0001234' },
];

describe('detectIdentifier', () => {
  it('normalises typed identifiers into direct links', () => {
    expect(detectIdentifier(' inv00123456 ')).toMatchObject({ type: 'INVOICE', id: 'INV-00123456', path: '/portals/uconnect/invoices/INV-00123456' });
    expect(detectIdentifier('ACC-12345678')?.path).toBe('/accounts/ACC-12345678');
    expect(detectIdentifier('slow wifi')).toBeUndefined();
  });
});

describe('GlobalSearch', () => {
  it('jumps straight to a typed ticket number without querying the search API', async () => {
    // A long debounce proves the jump happens without waiting for any search round-trip.
    const service = renderSearch(async () => [], 10_000);
    await userEvent.type(screen.getByRole('combobox'), 'TKT-1234567{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/portals/uconnect/tickets/TKT-1234567');
    expect(service.search).not.toHaveBeenCalled();
  });

  it('shows grouped results and supports keyboard selection in display order', async () => {
    renderSearch(async () => results);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'slow');
    expect(await screen.findByRole('group', { name: 'Support tickets' })).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    // Tickets are listed before help articles regardless of API order.
    expect(options.map((o) => o.textContent)).toEqual(['Slow broadband ticket', 'Fixing slow wifi']);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('location')).toHaveTextContent('/help/slow-wifi');
  });

  it('does not search below the minimum length and aborts superseded requests', async () => {
    const signals: AbortSignal[] = [];
    const service = renderSearch(
      (_q, signal) =>
        new Promise((resolve) => {
          signals.push(signal!);
          setTimeout(() => resolve(results), 20);
        }),
    );
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 's');
    expect(service.search).not.toHaveBeenCalled();

    await userEvent.type(input, 'lo');
    await waitFor(() => expect(service.search).toHaveBeenCalled());
    await userEvent.type(input, 'w');
    await waitFor(() => expect(signals.length).toBeGreaterThanOrEqual(2));
    expect(signals[0].aborted).toBe(true);
  });
});
