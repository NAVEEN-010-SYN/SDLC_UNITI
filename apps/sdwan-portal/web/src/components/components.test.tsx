import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MetricChart, niceMax, segments } from './MetricChart';
import { PaginatedTable, pageWindow } from './PaginatedTable';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('always renders text alongside the colour tone', () => {
    render(<StatusPill value="DEGRADED" />);
    expect(screen.getByText('Degraded')).toHaveAttribute('data-tone', 'warn');
  });
});

describe('PaginatedTable', () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `e${i + 21}`, name: `edge-${i + 21}` }));
  const columns = [{ key: 'name', header: 'Name', render: (r: { name: string }) => r.name }];

  it('shows the visible range and moves between pages', () => {
    const onPageChange = vi.fn();
    render(<PaginatedTable columns={columns} data={{ items: rows, page: 3, pageSize: 10, total: 23 }} rowKey={(r) => r.id} onPageChange={onPageChange} />);
    expect(screen.getByText('21–23 of 23')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('renders the empty message', () => {
    render(<PaginatedTable columns={columns} data={{ items: [], page: 1, pageSize: 10, total: 0 }} rowKey={(r: { id: string }) => r.id} onPageChange={vi.fn()} emptyMessage="No edges" />);
    expect(screen.getByText('No edges')).toBeInTheDocument();
  });

  it('keeps a fixed-width window of page links', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(1, 2)).toEqual([1, 2]);
  });
});

describe('MetricChart', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 2, 2, 10, min)).toISOString();

  it('breaks the line across missing buckets', () => {
    const pts = [0, 5, 10, 30, 35].map((m) => ({ t: t(m), v: 1 }));
    expect(segments(pts, 300).map((s) => s.length)).toEqual([3, 2]);
  });

  it('rounds the axis to readable maxima', () => {
    expect([niceMax(0.7), niceMax(13), niceMax(160), niceMax(0)]).toEqual([1, 20, 200, 1]);
  });

  it('draws the SLA threshold and counts breaching intervals', () => {
    render(<MetricChart title="Latency" unit=" ms" points={[{ t: t(0), v: 20 }, { t: t(5), v: 210 }]} threshold={150} bucketSeconds={300} />);
    expect(screen.getByTestId('threshold')).toBeInTheDocument();
    expect(screen.getByText(/1 interval\(s\) over 150 ms/)).toBeInTheDocument();
  });

  it('says so when there is no data', () => {
    render(<MetricChart title="Jitter" unit=" ms" points={[]} bucketSeconds={300} />);
    expect(screen.getByText('No samples in this range')).toBeInTheDocument();
  });
});
