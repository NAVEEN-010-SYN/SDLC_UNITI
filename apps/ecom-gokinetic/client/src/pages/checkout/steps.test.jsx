import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactStep, PaymentStep, ReviewStep } from './steps';
import { Stepper, STEPS } from './CheckoutPage';

const CART = {
  serviceAddress: { line1: '12 MAIN ST', city: 'AUSTIN', state: 'TX', postalCode: '78701' },
  pricing: { dueToday: 24225 },
  items: [],
};

const DRAFT = {
  contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '' },
  billingAddress: null,
  appointment: { date: '2026-11-27', windowId: 'AM', label: '8am - 12pm', startsAt: '2026-11-27T13:00:00.000Z' },
  payment: { token: 'tok_1', last4: '4242', brand: 'visa' },
};

describe('ContactStep', () => {
  test('normalises the phone and defaults billing to the service address', async () => {
    const onNext = vi.fn();
    render(<ContactStep draft={DRAFT} cart={CART} onNext={onNext} />);
    await userEvent.type(screen.getByLabelText('Mobile phone'), '(512) 555-0100');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledWith({
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '5125550100' },
      billingAddress: null,
    });
  });

  test('requires a billing address once the shopper unticks "same as service"', async () => {
    const onNext = vi.fn();
    render(<ContactStep draft={{ ...DRAFT, contact: { ...DRAFT.contact, phone: '5125550100' } }} cart={CART} onNext={onNext} />);
    await userEvent.click(screen.getByLabelText(/same as the service address/));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a 5-digit ZIP code.')).toBeInTheDocument();
  });
});

describe('PaymentStep', () => {
  test('validates the card locally before tokenising', async () => {
    const tokenize = vi.fn();
    render(<PaymentStep cart={CART} onNext={vi.fn()} tokenize={tokenize} />);
    expect(screen.getByText(/hold of \$242\.25/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Card number/), '4242424242424241');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a valid card number.')).toBeInTheDocument();
    expect(tokenize).not.toHaveBeenCalled();
  });

  test('passes the gateway token, never the card number, to the next step', async () => {
    const onNext = vi.fn();
    const tokenize = vi.fn().mockResolvedValue({ token: 'tok_abc', last4: '4242', brand: 'visa' });
    render(<PaymentStep cart={CART} onNext={onNext} tokenize={tokenize} />);
    await userEvent.type(screen.getByLabelText(/Card number/), '4242424242424242');
    await userEvent.type(screen.getByLabelText('Expiry (MM/YY)'), '12/30');
    await userEvent.type(screen.getByLabelText('Security code'), '123');
    await userEvent.type(screen.getByLabelText('Billing ZIP'), '78701');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalledWith({ payment: { token: 'tok_abc', last4: '4242', brand: 'visa' } });
  });

  test('shows tokenisation failures', async () => {
    const tokenize = vi.fn().mockRejectedValue(new Error('Your card could not be verified.'));
    render(<PaymentStep cart={CART} onNext={vi.fn()} tokenize={tokenize} />);
    await userEvent.type(screen.getByLabelText(/Card number/), '4242424242424242');
    await userEvent.type(screen.getByLabelText('Expiry (MM/YY)'), '12/30');
    await userEvent.type(screen.getByLabelText('Security code'), '123');
    await userEvent.type(screen.getByLabelText('Billing ZIP'), '78701');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your card could not be verified.');
  });
});

describe('ReviewStep', () => {
  test('requires the terms before placing the order', async () => {
    const onPlace = vi.fn();
    render(<ReviewStep draft={DRAFT} cart={CART} onPlace={onPlace} placing={false} error={null} />);
    expect(screen.getByText('visa ending 4242')).toBeInTheDocument();
    expect(screen.getByText('Same as service address')).toBeInTheDocument();
    const place = screen.getByRole('button', { name: /Place order - \$242\.25 today/ });
    await userEvent.click(place);
    expect(onPlace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText(/terms of service/));
    await userEvent.click(place);
    expect(onPlace).toHaveBeenCalled();
  });
});

test('Stepper lets shoppers go back but not skip ahead', async () => {
  const onSelect = vi.fn();
  render(<Stepper steps={STEPS} current={2} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(onSelect).toHaveBeenCalledWith(0);
  expect(screen.queryByRole('button', { name: 'Payment' })).not.toBeInTheDocument();
  expect(screen.getByText('Installation')).toHaveAttribute('aria-current', 'step');
});
