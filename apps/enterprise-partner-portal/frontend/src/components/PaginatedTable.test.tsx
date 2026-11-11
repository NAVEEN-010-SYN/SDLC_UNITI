import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProblemError } from '../api/problem';
import { pageCount, PaginatedTable, type Column } from './PaginatedTable';

interface Row { id: string; name: string }
const columns: Column<Row>[] = [{ header: 'Name', render: (r) => r.name }];

describe('PaginatedTable', () => {
  it('shows the visible range and moves between pages', async () => {
    const onPageChange = vi.fn();
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={onPageChange}
      page={{ items: [{ id: '1', name: 'Northwind' }], page: 2, pageSize: 20, total: 41 }} />);

    expect(screen.getByText('Northwind')).toBeInTheDocument();
    expect(screen.getByText('21–40 of 41')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange.mock.calls).toEqual([[3], [1]]);
  });

  it('disables navigation at the edges and shows the empty message', () => {
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={vi.fn()}
      emptyMessage="No leads." page={{ items: [], page: 1, pageSize: 20, total: 0 }} />);

    expect(screen.getByText('No leads.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('renders API problems with the correlation reference', () => {
    const error = new ProblemError({ status: 403, detail: 'This record belongs to another partner', correlationId: 'abc-123' });
    render(<PaginatedTable columns={columns} loading={false} rowKey={(r) => r.id} onPageChange={vi.fn()} error={error} />);

    expect(screen.getByRole('alert')).toHaveTextContent('This record belongs to another partner (reference abc-123)');
  });

  it('computes at least one page', () => {
    expect(pageCount({ total: 0, pageSize: 20 })).toBe(1);
    expect(pageCount({ total: 101, pageSize: 50 })).toBe(3);
  });
});
