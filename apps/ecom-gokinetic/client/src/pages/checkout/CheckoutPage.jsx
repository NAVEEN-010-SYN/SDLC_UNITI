import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { newIdempotencyKey } from '../../api/client';
import { tokenizeCard } from '../../lib/paymentTokenizer';
import { PriceSummary } from '../../components/PriceSummary';
import { ContactStep, PlanStep, AppointmentStep, PaymentStep, ReviewStep } from './steps';

export const STEPS = [
  { id: 'contact', label: 'Details', Component: ContactStep },
  { id: 'plan', label: 'Plan & add-ons', Component: PlanStep },
  { id: 'appointment', label: 'Installation', Component: AppointmentStep },
  { id: 'payment', label: 'Payment', Component: PaymentStep },
  { id: 'review', label: 'Review', Component: ReviewStep },
];

/** Codes after which the shopper must go back to the cart to fix something. */
const CART_PROBLEMS = new Set(['ADDRESS_NOT_SERVICEABLE', 'PLAN_NOT_AVAILABLE_AT_ADDRESS', 'OUT_OF_STOCK', 'CART_CLOSED', 'PLAN_REQUIRED']);

export function Stepper({ steps, current, onSelect }) {
  return (
    <ol className="stepper" aria-label="Checkout progress">
      {steps.map((step, index) => (
        <li key={step.id} className={`stepper__step${index === current ? ' stepper__step--current' : ''}${index < current ? ' stepper__step--done' : ''}`}>
          {index < current ? (
            <button type="button" className="btn btn--link" onClick={() => onSelect(index)}>
              {step.label}
            </button>
          ) : (
            <span aria-current={index === current ? 'step' : undefined}>{step.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Multi-step checkout. Steps collect a draft locally; only the final step
 * calls the API. The Idempotency-Key is created once per checkout so a
 * retried submission (double click, flaky network) can never create a
 * second order or a second card hold.
 */
export function CheckoutPage({ tokenize = tokenizeCard }) {
  const { user, endpoints } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const idempotencyKey = useRef(newIdempotencyKey('order'));
  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({
    contact: { firstName: user.firstName || '', lastName: user.lastName || '', email: user.email || '', phone: '' },
    billingAddress: null,
    appointment: null,
    payment: null,
  });

  const current = cart.cart;
  if (!current || !current.readyForCheckout) return <Navigate to="/cart" replace />;

  const next = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const place = async () => {
    setPlacing(true);
    setError(null);
    try {
      const order = await endpoints.checkout.placeOrder(
        {
          cartId: current.id,
          paymentToken: draft.payment.token,
          contact: draft.contact,
          ...(draft.billingAddress ? { billingAddress: draft.billingAddress } : {}),
          ...(draft.appointment ? { preferredInstallDate: draft.appointment.startsAt } : {}),
          acceptTerms: true,
        },
        idempotencyKey.current,
      );
      cart.clear();
      navigate(`/orders/${order.orderNumber}?placed=1`, { replace: true });
    } catch (err) {
      setError(err);
      if (err.status === 402) {
        // Declined card: a new attempt is a new request with a new token.
        idempotencyKey.current = newIdempotencyKey('order');
        setStep(STEPS.findIndex((s) => s.id === 'payment'));
      } else if (err.code === 'INSTALL_DATE_UNAVAILABLE') {
        idempotencyKey.current = newIdempotencyKey('order');
        setStep(STEPS.findIndex((s) => s.id === 'appointment'));
      } else if (CART_PROBLEMS.has(err.code)) {
        await cart.refresh().catch(() => {});
      }
    } finally {
      setPlacing(false);
    }
  };

  const { Component } = STEPS[step];
  return (
    <div className="page page--two-col">
      <section>
        <h1>Checkout</h1>
        <Stepper steps={STEPS} current={step} onSelect={setStep} />
        {error && step !== STEPS.length - 1 && (
          <p className="alert alert--error" role="alert">
            {error.detail || error.message}
          </p>
        )}
        <Component draft={draft} cart={current} onNext={next} tokenize={tokenize} onPlace={place} placing={placing} error={error} />
      </section>
      <aside>
        <PriceSummary pricing={current.pricing} />
      </aside>
    </div>
  );
}
