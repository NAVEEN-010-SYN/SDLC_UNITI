import { describe, expect, test, vi } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceSummary } from './PriceSummary';
import { ProblemAlert, Pagination, StatusBadge } from './ui';
import { OrderTimeline } from './OrderTimeline';
import { useForm } from '../hooks/useForm';
import { rules } from '../lib/validation';
import { ApiError } from '../api/client';

const PRICING = {
  contractTermMonths: 24,
  volumeDiscountBps: 0,
  recurring: { subtotal: 8000, termDiscount: 400, volumeDiscount: 0, negotiatedDiscount: 0, promoDiscount: 0, tax: 475, total: 8075 },
  oneTime: { hardware: 12900, installation: 9900, installationWaived: 9900, promoDiscount: 0, tax: 806, total: 13706 },
  promo: { code: 'WELCOME-3FREE', applied: true },
  introductory: { freeMonths: 3, monthlyCredit: 8075 },
  dueToday: 13706,
  firstMonthlyBill: 0,
  totalContractValue: 169575,
};

describe('PriceSummary', () => {
  test('shows monthly and due-today totals with credits and free months', () => {
    render(<PriceSummary pricing={PRICING} />);
    expect(screen.getByText('Monthly total').nextSibling).toHaveTextContent('$80.75');
    expect(screen.getByText('24-month contract discount').nextSibling).toHaveTextContent('-$4.00');
    expect(screen.getByText('Installation waived').nextSibling).toHaveTextContent('-$99.00');
    expect(screen.getByText(/Due today/, { selector: 'dt' }).nextSibling).toHaveTextContent('$137.06');
    expect(screen.getByText(/first 3 months are free/i)).toBeInTheDocument();
    expect(screen.queryByText('Negotiated discount')).not.toBeInTheDocument();
  });
});

describe('ProblemAlert', () => {
  test('hides internal detail but shows the reference for server errors', () => {
    render(<ProblemAlert error={new ApiError({ status: 500, title: 'Internal server error', detail: 'stack', correlationId: 'cid-42' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on our side');
    expect(screen.getByText('cid-42')).toBeInTheDocument();
    expect(screen.queryByText('stack')).not.toBeInTheDocument();
  });

  test('shows rate-limit retry hints and a retry button', async () => {
    const onRetry = vi.fn();
    render(<ProblemAlert error={new ApiError({ status: 429, detail: 'Rate limit exceeded.', extensions: { retryAfterSeconds: 30 } })} onRetry={onRetry} />);
    expect(screen.getByText('Try again in 30 seconds.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

test('Pagination disables the edges and reports page changes', async () => {
  const onChange = vi.fn();
  render(<Pagination page={1} pageSize={10} total={25} onChange={onChange} />);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onChange).toHaveBeenCalledWith(2);
});

test('StatusBadge uses customer-friendly labels', () => {
  render(<StatusBadge status="OVERDUE" />);
  expect(screen.getByText('Overdue')).toHaveClass('badge--danger');
});

test('OrderTimeline marks the current step and explains closures', () => {
  render(
    <OrderTimeline
      timeline={{
        status: 'CANCELLED',
        closed: true,
        closedReason: 'Moving house',
        installAppointment: null,
        steps: [
          { status: 'SUBMITTED', label: 'Order placed', state: 'COMPLETE', completedAt: '2026-11-10T10:00:00Z', estimatedAt: null },
          { status: 'VALIDATED', label: 'Order confirmed', state: 'SKIPPED', completedAt: null, estimatedAt: null },
        ],
      }}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('cancelled: Moving house');
  expect(screen.getByText('Not reached')).toBeInTheDocument();
});

describe('useForm', () => {
  const schema = { email: [rules.email()], 'address.city': [rules.required('City')] };

  test('only shows errors after touch or submit, and blocks invalid submits', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useForm({ email: '', address: { city: '' } }, schema));
    expect(result.current.field('email').error).toBeUndefined();
    await act(() => result.current.handleSubmit(onSubmit)());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.field('address.city').error).toBe('City is required.');
  });

  test('maps server field errors onto fields and clears them on edit', async () => {
    const { result } = renderHook(() => useForm({ email: 'a@b.co', address: { city: 'Austin' } }, schema));
    await act(() =>
      result.current.handleSubmit(async () => {
        throw new ApiError({ status: 409, errors: [{ path: 'email', message: 'Already registered.' }] });
      })(),
    );
    expect(result.current.field('email').error).toBe('Already registered.');
    act(() => result.current.setValue('email', 'c@d.co'));
    expect(result.current.field('email').error).toBeUndefined();
  });
});
