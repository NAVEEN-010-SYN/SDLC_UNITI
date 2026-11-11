import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from '../../hooks/useForm';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../context/AuthContext';
import { addressSchema, normalizePhone, rules, trimAddress } from '../../lib/validation';
import { validateCard, cardBrand } from '../../lib/paymentTokenizer';
import { formatAddress, formatCalendarDate, formatMoney, formatTerm } from '../../lib/format';
import { AddressFields, EMPTY_ADDRESS } from '../../components/AddressFields';
import { Button, Field, ProblemAlert, Spinner } from '../../components/ui';

/**
 * Checkout steps. Each step receives the accumulated `draft` and calls
 * `onNext(patch)` with its contribution; none of them talk to the order API.
 */

const contactSchema = {
  'contact.firstName': [rules.required('First name')],
  'contact.lastName': [rules.required('Last name')],
  'contact.email': [rules.email()],
  'contact.phone': [rules.phone()],
};

export function ContactStep({ draft, cart, onNext }) {
  // The billing toggle changes the schema, so it lives outside the form values.
  const [sameAsService, setSameAsService] = useState(draft.billingAddress === null);
  const schema = sameAsService ? contactSchema : { ...contactSchema, ...addressSchema('billingAddress') };
  const form = useForm({ contact: draft.contact, billingAddress: draft.billingAddress || EMPTY_ADDRESS }, schema);

  const onSubmit = form.handleSubmit((values) =>
    onNext({
      contact: { ...values.contact, phone: normalizePhone(values.contact.phone) },
      billingAddress: sameAsService ? null : trimAddress(values.billingAddress),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2>Contact details</h2>
      <div className="grid-2">
        <Field label="First name" autoComplete="given-name" {...form.field('contact.firstName')} />
        <Field label="Last name" autoComplete="family-name" {...form.field('contact.lastName')} />
        <Field label="Email" type="email" autoComplete="email" {...form.field('contact.email')} />
        <Field label="Mobile phone" type="tel" autoComplete="tel" {...form.field('contact.phone')} />
      </div>
      <p>
        Service address: <strong>{formatAddress(cart.serviceAddress)}</strong>
      </p>
      <Field
        type="checkbox"
        id="billing-same"
        label="Billing address is the same as the service address"
        checked={sameAsService}
        onChange={(e) => setSameAsService(e.target.checked)}
      />
      {!sameAsService && <AddressFields form={form} prefix="billingAddress" legend="Billing address" />}
      <Button type="submit">Continue</Button>
    </form>
  );
}

export function PlanStep({ cart, onNext }) {
  const plan = cart.items.find((i) => i.productType === 'PLAN');
  const extras = cart.items.filter((i) => i.productType !== 'PLAN');
  return (
    <section>
      <h2>Your plan</h2>
      <p>
        <strong>{plan.name}</strong> on a {formatTerm(cart.contractTermMonths).toLowerCase()} - {formatMoney(plan.unitMonthly)}/mo
      </p>
      {extras.length > 0 ? (
        <ul>
          {extras.map((i) => (
            <li key={i.sku}>
              {i.name} x{i.quantity}
            </li>
          ))}
        </ul>
      ) : (
        <p>No add-ons selected.</p>
      )}
      <p>
        <Link to="/cart">Change plan, term or add-ons</Link>
      </p>
      <Button onClick={() => onNext({})}>Continue</Button>
    </section>
  );
}

export function AppointmentStep({ draft, cart, onNext }) {
  const { endpoints } = useAuth();
  const slots = useAsync(() => endpoints.serviceability.installSlots(cart.serviceability.checkId, 14), [cart.serviceability.checkId]);
  const selected = draft.appointment;

  const choose = (date, window) => onNext({ appointment: { date: date.date, windowId: window.id, label: window.label, startsAt: window.startsAt } });

  return (
    <section>
      <h2>Installation appointment</h2>
      <p>Choose a preferred date. We confirm the exact appointment by email once your order is checked.</p>
      <ProblemAlert error={slots.error} onRetry={slots.reload} />
      {slots.loading && <Spinner label="Finding appointments" />}
      {slots.data && slots.data.requiresSiteSurvey && (
        <p className="alert alert--info">Your address needs a short site survey first, so the earliest date is a little later.</p>
      )}
      {slots.data && (
        <div className="slots" role="radiogroup" aria-label="Installation date">
          {slots.data.slots.map((day) => (
            <div key={day.date} className="slots__day">
              <span className="slots__date">{formatCalendarDate(day.date)}</span>
              {day.windows.map((w) => {
                const isSelected = selected && selected.date === day.date && selected.windowId === w.id;
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`slot${isSelected ? ' slot--selected' : ''}`}
                    onClick={() => choose(day, w)}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn--link" onClick={() => onNext({ appointment: null })}>
        No preference - give me the first available slot
      </button>
    </section>
  );
}

/** Card field rules expressed through the shared form schema shape. */
const cardSchema = Object.fromEntries(
  ['number', 'expiry', 'cvc', 'postalCode'].map((name) => [name, [(_value, values) => validateCard(values)[name] || null]]),
);

export function PaymentStep({ cart, onNext, tokenize }) {
  const form = useForm({ number: '', expiry: '', cvc: '', postalCode: '' }, cardSchema);
  const due = cart.pricing.dueToday;

  const submit = form.handleSubmit(async (values) => {
    onNext({ payment: await tokenize(values) });
  });

  return (
    <form onSubmit={submit} noValidate>
      <h2>Payment</h2>
      <p>
        {due > 0
          ? `We will place a hold of ${formatMoney(due)} on your card and charge it once your order is confirmed.`
          : 'Nothing is due today. Your card is kept on file for monthly billing.'}
      </p>
      <Field
        label={`Card number${form.values.number ? ` (${cardBrand(form.values.number)})` : ''}`}
        inputMode="numeric"
        autoComplete="cc-number"
        {...form.field('number')}
      />
      <div className="grid-3">
        <Field label="Expiry (MM/YY)" autoComplete="cc-exp" {...form.field('expiry')} />
        <Field label="Security code" inputMode="numeric" autoComplete="cc-csc" {...form.field('cvc')} />
        <Field label="Billing ZIP" inputMode="numeric" autoComplete="postal-code" {...form.field('postalCode')} />
      </div>
      {form.formError && (
        <p className="alert alert--error" role="alert">
          {form.formError.message}
        </p>
      )}
      <Button type="submit" pending={form.submitting}>
        Continue
      </Button>
    </form>
  );
}

export function ReviewStep({ draft, cart, onPlace, placing, error }) {
  const form = useForm({ acceptTerms: false }, { acceptTerms: [rules.checked('Please accept the terms to place your order.')] });
  return (
    <form onSubmit={form.handleSubmit(onPlace)} noValidate>
      <h2>Review and place order</h2>
      <dl className="review">
        <dt>Contact</dt>
        <dd>
          {draft.contact.firstName} {draft.contact.lastName}, {draft.contact.email}
        </dd>
        <dt>Service address</dt>
        <dd>{formatAddress(cart.serviceAddress)}</dd>
        <dt>Billing address</dt>
        <dd>{draft.billingAddress ? formatAddress(draft.billingAddress) : 'Same as service address'}</dd>
        <dt>Installation</dt>
        <dd>{draft.appointment ? `${formatCalendarDate(draft.appointment.date)}, ${draft.appointment.label}` : 'First available'}</dd>
        <dt>Payment</dt>
        <dd>
          {draft.payment.brand} ending {draft.payment.last4}
        </dd>
      </dl>
      <Field type="checkbox" label="I agree to the GoKinetic terms of service and broadband key facts" {...form.field('acceptTerms', { type: 'checkbox' })} />
      <ProblemAlert error={error} />
      <Button type="submit" pending={placing}>
        Place order - {formatMoney(cart.pricing.dueToday)} today
      </Button>
    </form>
  );
}
