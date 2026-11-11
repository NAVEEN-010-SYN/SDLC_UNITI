# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic (part 2 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 18

## Files

- `apps/ecom-gokinetic/client/src/pages/AuthPages.jsx` (128 lines)
- `apps/ecom-gokinetic/client/src/pages/CartPage.jsx` (147 lines)
- `apps/ecom-gokinetic/client/src/pages/ComparePage.jsx` (82 lines)
- `apps/ecom-gokinetic/client/src/pages/PlansPage.jsx` (106 lines)
- `apps/ecom-gokinetic/client/src/pages/account/AccountPages.jsx` (257 lines)
- `apps/ecom-gokinetic/client/src/pages/business/BusinessPages.jsx` (290 lines)
- `apps/ecom-gokinetic/client/src/pages/checkout/CheckoutPage.jsx` (121 lines)
- `apps/ecom-gokinetic/client/src/pages/checkout/steps.jsx` (210 lines)
- `apps/ecom-gokinetic/client/src/pages/checkout/steps.test.jsx` (100 lines)
- `apps/ecom-gokinetic/client/src/styles.css` (133 lines)
- `apps/ecom-gokinetic/client/src/test/setup.js` (10 lines)
- `apps/ecom-gokinetic/client/vite.config.js` (22 lines)
- `apps/ecom-gokinetic/server/.env.example` (58 lines)
- `apps/ecom-gokinetic/server/Dockerfile` (19 lines)
- `apps/ecom-gokinetic/server/package.json` (45 lines)
- `apps/ecom-gokinetic/server/src/app.js` (69 lines)
- `apps/ecom-gokinetic/server/src/config/db.js` (49 lines)
- `apps/ecom-gokinetic/server/src/config/index.js` (133 lines)

## apps/ecom-gokinetic/client/src/pages/AuthPages.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/AuthPages.jsx`.

```jsx
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useForm } from '../hooks/useForm';
import { normalizePhone, rules } from '../lib/validation';
import { Button, Field, ProblemAlert } from '../components/ui';

function useReturnTo(fallback = '/account') {
  const location = useLocation();
  return (location.state && location.state.from) || fallback;
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const form = useForm({ email: '', password: '' }, { email: [rules.email()], password: [rules.required('Password')] });

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const submit = form.handleSubmit(async (values) => {
    await login({ email: values.email.trim(), password: values.password });
    navigate(returnTo, { replace: true });
  });

  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>Sign in</h1>
      <Field label="Email" type="email" autoComplete="username" {...form.field('email')} />
      <Field label="Password" type="password" autoComplete="current-password" {...form.field('password')} />
      <ProblemAlert error={form.formError && form.formError.code !== 'ACCOUNT_LOCKED' ? form.formError : null} />
      {form.formError && form.formError.code === 'ACCOUNT_LOCKED' && (
        <p className="alert alert--error" role="alert">
          Too many attempts. Your login is locked until{' '}
          {new Date(form.formError.extensions.lockedUntil).toLocaleTimeString()}.
        </p>
      )}
      <Button type="submit" pending={form.submitting}>Sign in</Button>
      <p>
        New to GoKinetic? <Link to="/register" state={{ from: returnTo }}>Create an account</Link>
      </p>
    </form>
  );
}

const registerSchema = (isBusiness) => ({
  firstName: [rules.required('First name')],
  lastName: [rules.required('Last name')],
  email: [rules.email()],
  phone: [rules.phone()],
  password: [rules.password()],
  confirmPassword: [rules.matches('password', 'Passwords do not match.')],
  ...(isBusiness ? { businessName: [rules.required('Business name'), rules.minLength(2, 'Business name')] } : {}),
});

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = useReturnTo('/plans');
  const isBusiness = params.get('segment') === 'BUSINESS';
  const form = useForm(
    { firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '', businessName: '', marketingOptIn: false },
    registerSchema(isBusiness),
  );

  if (isAuthenticated) return <Navigate to={returnTo} replace />;

  const submit = form.handleSubmit(async ({ confirmPassword, businessName, phone, ...values }) => {
    await register({
      ...values,
      email: values.email.trim(),
      phone: normalizePhone(phone),
      segment: isBusiness ? 'BUSINESS' : 'CONSUMER',
      ...(isBusiness ? { businessName: businessName.trim() } : {}),
    });
    navigate(returnTo, { replace: true });
  });

  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>{isBusiness ? 'Create a Business GoKinetic account' : 'Create your account'}</h1>
      {isBusiness && <Field label="Business name" autoComplete="organization" {...form.field('businessName')} />}
      <div className="grid-2">
        <Field label="First name" autoComplete="given-name" {...form.field('firstName')} />
        <Field label="Last name" autoComplete="family-name" {...form.field('lastName')} />
      </div>
      <Field label="Email" type="email" autoComplete="email" {...form.field('email')} />
      <Field label="Mobile phone" type="tel" autoComplete="tel" {...form.field('phone')} />
      <Field label="Password" type="password" autoComplete="new-password" hint="At least 10 characters with upper and lower case and a digit." {...form.field('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" {...form.field('confirmPassword')} />
      <Field type="checkbox" label="Send me offers and service news" {...form.field('marketingOptIn', { type: 'checkbox' })} />
      <ProblemAlert error={form.formError} />
      <Button type="submit" pending={form.submitting}>Create account</Button>
      <p>
        {isBusiness ? <Link to="/register">Signing up for home broadband?</Link> : <Link to="/register?segment=BUSINESS">Signing up a business?</Link>}
      </p>
    </form>
  );
}

/** Invited Business GoKinetic colleagues set their password here. */
export function ActivatePage() {
  const { endpoints } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const form = useForm(
    { password: '', confirmPassword: '' },
    { password: [rules.password()], confirmPassword: [rules.matches('password', 'Passwords do not match.')] },
  );

  const submit = form.handleSubmit(async ({ password }) => {
    await endpoints.auth.activate({ token, password });
    navigate('/login', { replace: true, state: { from: '/business/quotes' } });
  });

  if (!token) return <p className="alert alert--error">This invitation link is incomplete. Ask your administrator to resend it.</p>;
  return (
    <form className="page page--narrow" onSubmit={submit} noValidate>
      <h1>Activate your login</h1>
      <Field label="Choose a password" type="password" autoComplete="new-password" {...form.field('password')} />
      <Field label="Confirm password" type="password" autoComplete="new-password" {...form.field('confirmPassword')} />
      <ProblemAlert error={form.formError} />
      <Button type="submit" pending={form.submitting}>Activate</Button>
    </form>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/CartPage.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/CartPage.jsx`.

```jsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAsync, useAction } from '../hooks/useAsync';
import { formatAddress, formatMoney, formatTerm } from '../lib/format';
import { PriceSummary } from '../components/PriceSummary';
import { Button, EmptyState, ProblemAlert } from '../components/ui';

const TERMS = [0, 12, 24, 36];

/** Cart with quantity edits, contract term, add-on upsell and promo codes. */
export function CartPage() {
  const { endpoints, isAuthenticated } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const [promo, setPromo] = useState('');
  const current = cart.cart;
  const plan = current && current.items.find((i) => i.productType === 'PLAN');

  const bundle = useAsync(() => endpoints.catalog.detail(plan.sku, current.segment), [plan && plan.sku], { enabled: Boolean(plan) });
  const action = useAction((fn) => fn());

  if (!current || current.items.length === 0) {
    return (
      <EmptyState title="Your cart is empty">
        <Link to="/plans" className="btn btn--primary">Browse plans</Link>
      </EmptyState>
    );
  }

  const inCart = new Set(current.items.map((i) => i.sku));
  const addons = bundle.data ? bundle.data.addons.filter((a) => !inCart.has(a.sku)) : [];
  const terms = current.segment === 'BUSINESS' ? TERMS.filter((t) => t > 0) : TERMS;

  return (
    <div className="page page--two-col">
      <section>
        <h1>Your cart</h1>
        {current.warnings.map((w) => (
          <p key={`${w.code}-${w.sku || ''}`} className="alert alert--warning">{w.message}</p>
        ))}
        <ProblemAlert error={action.error} />

        <ul className="cart-lines">
          {current.items.map((item) => (
            <li key={item.sku} className="cart-line">
              <div>
                <strong>{item.name}</strong>
                <span className="cart-line__price">
                  {item.unitMonthly > 0 && `${formatMoney(item.unitMonthly)}/mo`}
                  {item.unitOneTime > 0 && ` ${formatMoney(item.unitOneTime)} one-time`}
                </span>
              </div>
              {item.productType !== 'PLAN' && (
                <label>
                  Qty{' '}
                  <select value={item.quantity} onChange={(e) => action.execute(() => cart.updateQuantity(item.sku, Number(e.target.value)))}>
                    {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="btn btn--link" onClick={() => action.execute(() => cart.removeItem(item.sku))}>
                Remove
              </button>
            </li>
          ))}
        </ul>

        <fieldset className="terms">
          <legend>Contract term</legend>
          {terms.map((months) => (
            <label key={months}>
              <input
                type="radio"
                name="term"
                checked={current.contractTermMonths === months}
                onChange={() => action.execute(() => cart.setTerm(months))}
              />{' '}
              {formatTerm(months)}
            </label>
          ))}
        </fieldset>

        {addons.length > 0 && (
          <section className="addons">
            <h2>Add to your plan</h2>
            {addons.map((addon) => (
              <div key={addon.sku} className="addon">
                <span>
                  {addon.name} -{' '}
                  {addon.monthlyPrice > 0 ? `${formatMoney(addon.monthlyPrice)}/mo` : formatMoney(addon.oneTimePrice)}
                </span>
                <Button variant="secondary" pending={cart.pending} onClick={() => action.execute(() => cart.addItem(addon.sku, 1, current.segment))}>
                  Add
                </Button>
              </div>
            ))}
          </section>
        )}

        <form
          className="promo"
          onSubmit={(e) => {
            e.preventDefault();
            if (promo.trim()) action.execute(() => cart.applyPromo(promo.trim().toUpperCase())).then(() => setPromo(''));
          }}
        >
          {current.promoCode ? (
            <p>
              Promo <strong>{current.promoCode}</strong> applied.{' '}
              <button type="button" className="btn btn--link" onClick={() => action.execute(() => cart.removePromo())}>
                Remove
              </button>
            </p>
          ) : (
            <>
              <label htmlFor="promo">Promo code</label>
              <input id="promo" value={promo} onChange={(e) => setPromo(e.target.value)} maxLength={24} />
              <Button type="submit" variant="secondary" pending={action.pending}>Apply</Button>
            </>
          )}
        </form>
      </section>

      <aside>
        {current.serviceAddress ? (
          <p>Service address: {formatAddress(current.serviceAddress)}</p>
        ) : (
          <p className="alert alert--info">
            <Link to="/plans">Check your address</Link> before checking out.
          </p>
        )}
        <PriceSummary pricing={current.pricing} />
        <Button
          disabled={!current.readyForCheckout}
          onClick={() => navigate(isAuthenticated ? '/checkout' : '/login', { state: { from: '/checkout' } })}
        >
          {isAuthenticated ? 'Checkout' : 'Sign in to checkout'}
        </Button>
      </aside>
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/ComparePage.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/ComparePage.jsx`.

```jsx
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { useAvailability } from '../hooks/useAvailability';
import { formatMoney, formatSpeed } from '../lib/format';
import { ProblemAlert, Spinner, EmptyState } from '../components/ui';

/**
 * Side-by-side plan comparison. Rows are derived from the API's compare
 * endpoint, which also flags the cheapest and fastest plan.
 */
export function ComparePage() {
  const { endpoints } = useAuth();
  const [params] = useSearchParams();
  const skus = (params.get('skus') || '').split(',').filter(Boolean);
  const availability = useAvailability();
  const result = useAsync(() => endpoints.catalog.compare(skus.join(',')), [skus.join(',')], { enabled: skus.length >= 2 });

  if (skus.length < 2) {
    return (
      <EmptyState title="Pick plans to compare">
        <p>
          Select two to four plans on the <Link to="/plans">plans page</Link>.
        </p>
      </EmptyState>
    );
  }

  const plans = result.data ? result.data.items : [];
  const allFeatures = [...new Set(plans.flatMap((p) => p.features))];
  const rows = [
    ['Download', (p) => formatSpeed(p.speedMbps)],
    ['Upload', (p) => formatSpeed(p.uploadMbps)],
    ['Monthly price', (p) => formatMoney(p.monthlyPrice)],
    ['Installation', (p) => formatMoney(p.installationFee)],
    ['Price per 100 Mbps', (p) => formatMoney(p.centsPerMbps * 100)],
    ['At your address', (p) => (availability.check ? (availability.isAvailable(p.sku) ? 'Available' : 'Not available') : 'Check address')],
    ...allFeatures.map((feature) => [feature, (p) => (p.features.includes(feature) ? 'Included' : '-')]),
  ];

  return (
    <div className="page">
      <h1>Compare plans</h1>
      <ProblemAlert error={result.error} onRetry={result.reload} />
      {result.loading && <Spinner />}
      {plans.length > 0 && (
        <div className="table-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Feature</span>
                </th>
                {plans.map((p) => (
                  <th key={p.sku} scope="col">
                    {p.name}
                    {p.isCheapest && <span className="badge badge--success">Best price</span>}
                    {p.isFastest && <span className="badge badge--info">Fastest</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {plans.map((p) => (
                    <td key={p.sku}>{cell(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link to="/plans" className="btn btn--secondary">
        Back to plans
      </Link>
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/PlansPage.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/PlansPage.jsx`.

```jsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useAsync, useAction } from '../hooks/useAsync';
import { useAvailability } from '../hooks/useAvailability';
import { AvailabilityChecker } from '../components/AvailabilityChecker';
import { PlanCard } from '../components/PlanCard';
import { ProblemAlert, Spinner, EmptyState } from '../components/ui';

const MAX_COMPARE = 4;
const SORTS = [
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: '-speed', label: 'Fastest first' },
];

/**
 * Plan catalogue with address availability. Once an address is checked the
 * list is filtered server-side to the plans the line can carry.
 */
export function PlansPage() {
  const { user, endpoints } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const segment = (user && user.segment) || (params.get('segment') === 'BUSINESS' ? 'BUSINESS' : 'CONSUMER');
  const sort = params.get('sort') || 'price';
  const availability = useAvailability();
  const checkId = availability.check && availability.check.serviceable ? availability.check.checkId : undefined;
  const [compare, setCompare] = useState([]);
  const [notice, setNotice] = useState(null);

  const plans = useAsync(
    () => endpoints.catalog.list({ type: 'PLAN', segment, sort, pageSize: 50, serviceabilityCheckId: checkId }),
    [segment, sort, checkId],
  );

  const choose = useAction(async (plan) => {
    if (!availability.check) {
      setNotice(`Enter your address to see if ${plan.name} is available.`);
      document.getElementById('availability-title')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const current = cart.cart && cart.cart.serviceability && cart.cart.serviceability.checkId;
    if (current !== availability.check.checkId) await cart.setAddress(availability.address, segment);
    await cart.addItem(plan.sku, 1, segment);
    navigate('/cart');
  });

  const toggleCompare = (sku) =>
    setCompare((list) => (list.includes(sku) ? list.filter((s) => s !== sku) : list.length < MAX_COMPARE ? [...list, sku] : list));

  const availabilityOf = (plan) => {
    if (!availability.check) return 'unknown';
    return availability.isAvailable(plan.sku) ? 'available' : 'unavailable';
  };

  return (
    <div className="page">
      <h1>{segment === 'BUSINESS' ? 'Business fibre plans' : 'Home fibre plans'}</h1>
      <AvailabilityChecker availability={availability} segment={segment} />
      {notice && !availability.check && <p className="alert alert--info">{notice}</p>}

      <div className="toolbar">
        <label htmlFor="sort">Sort</label>
        <select id="sort" value={sort} onChange={(e) => setParams({ ...Object.fromEntries(params), sort: e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {compare.length >= 2 && (
          <button type="button" className="btn btn--secondary" onClick={() => navigate(`/compare?skus=${compare.join(',')}`)}>
            Compare {compare.length} plans
          </button>
        )}
      </div>

      <ProblemAlert error={plans.error || choose.error} onRetry={plans.error ? plans.reload : undefined} />
      {plans.loading && <Spinner label="Loading plans" />}
      {plans.data && plans.data.items.length === 0 && (
        <EmptyState title="No plans available">
          <p>We could not find a plan for this address. Leave your details and we will tell you when fibre arrives.</p>
        </EmptyState>
      )}
      <div className="plan-grid">
        {plans.data &&
          plans.data.items.map((plan) => (
            <PlanCard
              key={plan.sku}
              plan={plan}
              availability={availabilityOf(plan)}
              recommended={availability.check && availability.check.recommendedPlanSku === plan.sku}
              onSelect={choose.execute}
              pending={choose.pending}
              onToggleCompare={toggleCompare}
              comparing={compare.includes(plan.sku)}
            />
          ))}
      </div>
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/account/AccountPages.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/account/AccountPages.jsx`.

```jsx
import { useState } from 'react';
import { Link, NavLink, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAsync, useAction } from '../../hooks/useAsync';
import { useForm } from '../../hooks/useForm';
import { addressSchema, rules, trimAddress } from '../../lib/validation';
import { formatAddress, formatDate, formatMoney, formatTerm } from '../../lib/format';
import { AddressFields, EMPTY_ADDRESS } from '../../components/AddressFields';
import { OrderTimeline } from '../../components/OrderTimeline';
import { Button, EmptyState, Field, Pagination, ProblemAlert, Spinner, StatusBadge } from '../../components/ui';

export function AccountLayout() {
  const { isBusiness, hasRole } = useAuth();
  return (
    <div className="page">
      <h1>My account</h1>
      <nav className="tabs" aria-label="Account">
        <NavLink end to="/account">Orders</NavLink>
        <NavLink to="/account/invoices">Invoices</NavLink>
        <NavLink to="/account/profile">Profile & addresses</NavLink>
        {isBusiness && hasRole('BUSINESS_ADMIN') && <NavLink to="/business/team">Team</NavLink>}
      </nav>
      <Outlet />
    </div>
  );
}

/** Reads `page` from the URL so pagination survives reloads and back. */
function usePageParam() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  return [page, (p) => setParams({ ...Object.fromEntries(params), page: String(p) })];
}

export function OrdersList() {
  const { endpoints } = useAuth();
  const [page, setPage] = usePageParam();
  const orders = useAsync(() => endpoints.orders.list({ page, pageSize: 10 }), [page]);
  if (orders.loading && !orders.data) return <Spinner />;
  if (orders.error) return <ProblemAlert error={orders.error} onRetry={orders.reload} />;
  if (orders.data.total === 0) {
    return (
      <EmptyState title="No orders yet">
        <Link to="/plans" className="btn btn--primary">Find a plan</Link>
      </EmptyState>
    );
  }
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Placed</th>
            <th scope="col">Address</th>
            <th scope="col">Monthly</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.data.items.map((o) => (
            <tr key={o.orderNumber}>
              <td><Link to={`/orders/${o.orderNumber}`}>{o.orderNumber}</Link></td>
              <td>{formatDate(o.submittedAt || o.createdAt)}</td>
              <td>{formatAddress(o.serviceAddress)}</td>
              <td>{formatMoney(o.monthlyRecurring)}</td>
              <td><StatusBadge status={o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...orders.data} onChange={setPage} />
    </>
  );
}

/** Order detail with tracking timeline and self-service cancellation. */
export function OrderPage() {
  const { orderNumber } = useParams();
  const [params] = useSearchParams();
  const { endpoints } = useAuth();
  const order = useAsync(() => endpoints.orders.get(orderNumber), [orderNumber]);
  const tracking = useAsync(() => endpoints.orders.tracking(orderNumber), [orderNumber]);
  const [reason, setReason] = useState('');
  const cancel = useAction(async () => {
    order.setData(await endpoints.orders.cancel(orderNumber, reason.trim()));
    await tracking.reload();
  });

  if (order.error) return <ProblemAlert error={order.error} />;
  if (!order.data || !tracking.data) return <Spinner label="Loading your order" />;
  const o = order.data;

  return (
    <div className="page">
      {params.get('placed') && (
        <div className="alert alert--success" role="status">
          <strong>Thank you! Order {o.orderNumber} has been placed.</strong>
          <p>We sent a confirmation to {o.contact.email}.</p>
        </div>
      )}
      <h1>Order {o.orderNumber} <StatusBadge status={o.status} /></h1>
      <OrderTimeline timeline={tracking.data.timeline} />
      <section className="grid-2">
        <div>
          <h2>Service</h2>
          <p>{formatAddress(o.serviceAddress)}</p>
          <ul>
            {o.items.map((i) => <li key={i.sku}>{i.name} x{i.quantity}</li>)}
          </ul>
          <p>{formatTerm(o.contractTermMonths)}</p>
        </div>
        <div>
          <h2>Charges</h2>
          <p>Monthly: {formatMoney(o.monthlyRecurring)}</p>
          <p>Paid at checkout: {formatMoney(o.dueToday)}{o.payment.last4 ? ` (card ending ${o.payment.last4})` : ''}</p>
          <Link to={`/account/invoices?orderNumber=${o.orderNumber}`}>View invoices</Link>
        </div>
      </section>
      {tracking.data.canCancel && (
        <section className="danger-zone">
          <h2>Cancel this order</h2>
          <label htmlFor="cancel-reason">Reason</label>
          <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <ProblemAlert error={cancel.error} />
          <Button variant="danger" disabled={reason.trim().length < 3} pending={cancel.pending} onClick={cancel.execute}>
            Cancel order
          </Button>
        </section>
      )}
    </div>
  );
}

export function InvoicesList() {
  const { endpoints } = useAuth();
  const [params] = useSearchParams();
  const [page, setPage] = usePageParam();
  const orderNumber = params.get('orderNumber') || undefined;
  const invoices = useAsync(() => endpoints.invoices.list({ page, pageSize: 12, orderNumber }), [page, orderNumber]);
  const [open, setOpen] = useState(null);

  if (invoices.error) return <ProblemAlert error={invoices.error} onRetry={invoices.reload} />;
  if (!invoices.data) return <Spinner />;
  if (invoices.data.total === 0) return <EmptyState title="No invoices yet"><p>Your first invoice is issued once your order is confirmed.</p></EmptyState>;
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Period</th>
            <th scope="col">Total</th>
            <th scope="col">Due</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.data.items.map((inv) => (
            <tr key={inv.invoiceNumber}>
              <td>
                <button type="button" className="btn btn--link" aria-expanded={open === inv.invoiceNumber} onClick={() => setOpen(open === inv.invoiceNumber ? null : inv.invoiceNumber)}>
                  {inv.invoiceNumber}
                </button>
                {open === inv.invoiceNumber && (
                  <ul className="invoice-lines">
                    {inv.lines.map((l, i) => <li key={i}>{l.description}: {formatMoney(l.amount)}</li>)}
                    <li>Tax: {formatMoney(inv.tax)}</li>
                  </ul>
                )}
              </td>
              <td>{inv.kind === 'INITIAL' ? 'Checkout charges' : `${formatDate(inv.periodStart)} - ${formatDate(new Date(new Date(inv.periodEnd).getTime() - 86400000))}`}</td>
              <td>{formatMoney(inv.total, inv.currency)}</td>
              <td>{formatDate(inv.dueAt)}</td>
              <td><StatusBadge status={inv.displayStatus} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...invoices.data} onChange={setPage} />
    </>
  );
}

export function ProfilePage() {
  const { endpoints } = useAuth();
  const overview = useAsync(() => endpoints.account.overview(), []);
  const addressForm = useForm({ label: '', address: EMPTY_ADDRESS, isDefault: false }, { label: [rules.required('Label')], ...addressSchema('address') });
  const remove = useAction(async (id) => {
    const { items } = await endpoints.account.removeAddress(id);
    overview.setData({ ...overview.data, account: { ...overview.data.account, addresses: items } });
  });

  if (overview.error) return <ProblemAlert error={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return <Spinner />;
  const { profile, account } = overview.data;
  const saveAddress = addressForm.handleSubmit(async ({ label, address, isDefault }) => {
    const { items } = await endpoints.account.addAddress({ label: label.trim(), address: trimAddress(address), isDefault });
    overview.setData({ ...overview.data, account: { ...account, addresses: items } });
    addressForm.reset();
  });

  return (
    <div className="grid-2">
      <ProfileForm profile={profile} accountId={account.accountId} onSaved={overview.reload} />
      <section>
        <h2>Saved addresses</h2>
        <ul className="addresses">
          {account.addresses.map((a) => (
            <li key={a._id || a.id}>
              <strong>{a.label}</strong>{a.isDefault && ' (default)'} - {formatAddress(a.address)}{' '}
              {a.serviceable === true && <span className="badge badge--success">Fibre available</span>}
              {a.serviceable === false && <span className="badge badge--muted">Not yet available</span>}
              <button type="button" className="btn btn--link" onClick={() => remove.execute(a._id || a.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <ProblemAlert error={remove.error} />
        <form onSubmit={saveAddress} noValidate>
          <Field label="Label (e.g. Home, Cabin)" {...addressForm.field('label')} />
          <AddressFields form={addressForm} legend="New address" />
          <Field type="checkbox" label="Make this my default address" {...addressForm.field('isDefault', { type: 'checkbox' })} />
          <ProblemAlert error={addressForm.formError} />
          <Button type="submit" variant="secondary" pending={addressForm.submitting}>Save address</Button>
        </form>
      </section>
    </div>
  );
}

function ProfileForm({ profile, accountId, onSaved }) {
  const { endpoints } = useAuth();
  const form = useForm(
    { firstName: profile.firstName, lastName: profile.lastName, marketingOptIn: profile.marketingOptIn },
    { firstName: [rules.required('First name')], lastName: [rules.required('Last name')] },
  );
  const save = form.handleSubmit(async (values) => {
    await endpoints.account.updateProfile(values);
    await onSaved();
  });
  return (
    <form onSubmit={save} noValidate>
      <h2>Profile</h2>
      <p>
        Account {accountId} - {profile.email}
      </p>
      <Field label="First name" {...form.field('firstName')} />
      <Field label="Last name" {...form.field('lastName')} />
      <Field type="checkbox" label="Send me offers and service news" {...form.field('marketingOptIn', { type: 'checkbox' })} />
      <ProblemAlert error={form.formError} />
      <Button type="submit" pending={form.submitting}>
        Save profile
      </Button>
    </form>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/business/BusinessPages.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/business/BusinessPages.jsx`.

```jsx
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAsync, useAction } from '../../hooks/useAsync';
import { useForm } from '../../hooks/useForm';
import { newIdempotencyKey } from '../../api/client';
import { parseSiteList, volumeTier } from '../../lib/sites';
import { normalizePhone, rules } from '../../lib/validation';
import { tokenizeCard, validateCard } from '../../lib/paymentTokenizer';
import { formatAddress, formatDate, formatMoney, formatSpeed, formatTerm } from '../../lib/format';
import { PriceSummary } from '../../components/PriceSummary';
import { Button, EmptyState, Field, Pagination, ProblemAlert, Spinner, StatusBadge } from '../../components/ui';

export function QuotesPage() {
  const { endpoints } = useAuth();
  const [page, setPage] = useState(1);
  const quotes = useAsync(() => endpoints.quotes.list({ page, pageSize: 10 }), [page]);
  return (
    <div className="page">
      <div className="toolbar">
        <h1>Multi-site quotes</h1>
        <Link to="/business/quotes/new" className="btn btn--primary">Request a quote</Link>
      </div>
      <ProblemAlert error={quotes.error} onRetry={quotes.reload} />
      {quotes.loading && !quotes.data && <Spinner />}
      {quotes.data && quotes.data.total === 0 && (
        <EmptyState title="No quotes yet">
          <p>Connecting five or more sites? Request a quote to unlock volume pricing.</p>
        </EmptyState>
      )}
      {quotes.data && quotes.data.total > 0 && (
        <>
          <table className="table">
            <thead>
              <tr><th scope="col">Quote</th><th scope="col">Sites</th><th scope="col">Monthly</th><th scope="col">Valid until</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {quotes.data.items.map((q) => (
                <tr key={q.quoteNumber}>
                  <td><Link to={`/business/quotes/${q.quoteNumber}`}>{q.quoteNumber}</Link></td>
                  <td>{q.sites.length}</td>
                  <td>{q.pricing ? formatMoney(q.pricing.recurring.total) : '-'}</td>
                  <td>{q.validUntil ? formatDate(q.validUntil) : '-'}</td>
                  <td><StatusBadge status={q.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination {...quotes.data} onChange={setPage} />
        </>
      )}
    </div>
  );
}

/**
 * Quote request: one bundle (plan + add-ons) installed at every site, with
 * the site list pasted from a spreadsheet.
 */
export function QuoteRequestPage() {
  const { endpoints, user } = useAuth();
  const navigate = useNavigate();
  const catalogue = useAsync(() => endpoints.catalog.list({ segment: 'BUSINESS', pageSize: 100, sort: 'speed' }), []);
  const form = useForm(
    { companyName: '', contactEmail: user.email || '', contactPhone: '', planSku: '', addons: {}, siteText: '', contractTermMonths: '36', notes: '' },
    {
      companyName: [rules.required('Company name')],
      contactEmail: [rules.email()],
      planSku: [rules.required('Plan')],
      siteText: [rules.required('Sites')],
    },
  );
  const { sites, problems } = useMemo(() => parseSiteList(form.values.siteText), [form.values.siteText]);
  const tier = volumeTier(sites.length);
  const products = catalogue.data ? catalogue.data.items : [];
  const plans = products.filter((p) => p.type === 'PLAN');
  const extras = products.filter((p) => p.type !== 'PLAN');

  const submit = form.handleSubmit(async (values) => {
    if (sites.length === 0) throw new Error('Add at least one valid site.');
    const items = [
      { sku: values.planSku, quantity: 1 },
      ...Object.entries(values.addons).filter(([, qty]) => Number(qty) > 0).map(([sku, qty]) => ({ sku, quantity: Number(qty) })),
    ];
    const quote = await endpoints.quotes.request({
      companyName: values.companyName.trim(),
      contactEmail: values.contactEmail.trim(),
      ...(values.contactPhone ? { contactPhone: normalizePhone(values.contactPhone) } : {}),
      items,
      sites,
      contractTermMonths: Number(values.contractTermMonths),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    });
    navigate(`/business/quotes/${quote.quoteNumber}`);
  });

  return (
    <form className="page" onSubmit={submit} noValidate>
      <h1>Request a multi-site quote</h1>
      <div className="grid-3">
        <Field label="Company name" {...form.field('companyName')} />
        <Field label="Contact email" type="email" {...form.field('contactEmail')} />
        <Field label="Contact phone (optional)" type="tel" {...form.field('contactPhone')} />
      </div>
      <h2>Bundle for each site</h2>
      <ProblemAlert error={catalogue.error} onRetry={catalogue.reload} />
      <Field label="Plan" as="select" {...form.field('planSku')}>
        <option value="">Choose a plan</option>
        {plans.map((p) => (
          <option key={p.sku} value={p.sku}>{p.name} - {formatSpeed(p.speedMbps)} - {formatMoney(p.monthlyPrice)}/mo</option>
        ))}
      </Field>
      {extras.map((p) => (
        <Field key={p.sku} label={`${p.name} per site`} type="number" min="0" max={p.maxQuantity} {...form.field(`addons.${p.sku}`)} />
      ))}
      <Field label="Contract term" as="select" {...form.field('contractTermMonths')}>
        {[12, 24, 36].map((t) => <option key={t} value={t}>{formatTerm(t)}</option>)}
      </Field>
      <h2>Sites</h2>
      <Field
        label="Paste one site per line: street, unit (optional), city, state, ZIP"
        as="textarea"
        rows={8}
        hint="You can paste straight from a spreadsheet."
        {...form.field('siteText')}
      />
      <p role="status">
        {sites.length} valid site{sites.length === 1 ? '' : 's'}
        {tier.discountPercent > 0 && ` - ${tier.discountPercent}% volume discount`}
        {tier.nextTier && sites.length > 0 && ` - add ${tier.nextTier.sitesNeeded} more for ${tier.nextTier.discountPercent}% off`}
      </p>
      {problems.length > 0 && (
        <ul className="alert alert--warning">
          {problems.map((p) => <li key={`${p.line}-${p.message}`}>{p.line ? `Line ${p.line}: ` : ''}{p.message}</li>)}
        </ul>
      )}
      <Field label="Notes for our sales team (optional)" as="textarea" rows={3} {...form.field('notes')} />
      <ProblemAlert error={form.formError && form.formError.status ? form.formError : null} />
      {form.formError && !form.formError.status && <p className="alert alert--error">{form.formError.message}</p>}
      <Button type="submit" pending={form.submitting}>Request quote</Button>
    </form>
  );
}

/** Quote review, acceptance and conversion into one order per site. */
export function QuoteDetailPage({ tokenize = tokenizeCard }) {
  const { quoteNumber } = useParams();
  const { endpoints, hasRole } = useAuth();
  const quote = useAsync(() => endpoints.quotes.get(quoteNumber), [quoteNumber]);
  const overview = useAsync(() => endpoints.account.overview(), []);
  const convertKey = useRef(newIdempotencyKey('convert'));
  const [poNumber, setPoNumber] = useState('');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', postalCode: '' });
  const [orders, setOrders] = useState(null);
  const canAccept = hasRole('BUSINESS_ADMIN');

  const accept = useAction(async () => quote.setData(await endpoints.quotes.accept(quoteNumber, poNumber.trim() || undefined)));
  const reject = useAction(async () => quote.setData(await endpoints.quotes.reject(quoteNumber, 'Declined by customer')));
  const onCredit = overview.data && overview.data.account.creditTermsDays > 0;
  const convert = useAction(async () => {
    let token;
    if (!onCredit) {
      const errors = validateCard(card);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      token = (await tokenize(card)).token;
    }
    const result = await endpoints.quotes.convert(quoteNumber, token, convertKey.current);
    quote.setData(result.quote);
    setOrders(result.orders);
  });

  if (quote.error) return <ProblemAlert error={quote.error} />;
  if (!quote.data) return <Spinner />;
  const q = quote.data;
  const actionError = accept.error || reject.error || convert.error;

  return (
    <div className="page page--two-col">
      <section>
        <h1>Quote {q.quoteNumber} <StatusBadge status={q.status} /></h1>
        <p>{q.companyName} - {formatTerm(q.contractTermMonths)}{q.validUntil && ` - valid until ${formatDate(q.validUntil)}`}</p>
        <h2>Bundle per site</h2>
        <ul>{q.items.map((i) => <li key={i.sku}>{i.name} x{i.quantity}</li>)}</ul>
        <h2>Sites ({q.sites.filter((s) => s.serviceable).length} of {q.sites.length} serviceable)</h2>
        <ul className="sites">
          {q.sites.map((s) => (
            <li key={formatAddress(s.address)}>
              {formatAddress(s.address)}{' '}
              {s.serviceable === true && <span className="badge badge--success">Up to {formatSpeed(s.maxSpeedMbps)}</span>}
              {s.serviceable === false && <span className="badge badge--muted">Not serviceable</span>}
              {s.serviceable === null && <span className="badge badge--info">Being checked</span>}
            </li>
          ))}
        </ul>
        <ProblemAlert error={actionError && actionError.status !== undefined ? actionError : null} />
        {actionError && actionError.status === undefined && <p className="alert alert--error">{actionError.message}</p>}

        {q.status === 'SENT' && canAccept && (
          <div className="actions">
            <label htmlFor="po">Purchase order number (optional)</label>
            <input id="po" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} maxLength={40} />
            <Button pending={accept.pending} onClick={accept.execute}>Accept quote</Button>
            <Button variant="secondary" pending={reject.pending} onClick={reject.execute}>Decline</Button>
          </div>
        )}
        {q.status === 'ACCEPTED' && canAccept && (
          <div className="actions">
            <h2>Place orders</h2>
            {onCredit ? (
              <p>Your account is on {overview.data.account.creditTermsDays}-day credit terms; installation charges will be invoiced.</p>
            ) : (
              <div className="grid-2">
                {['number', 'expiry', 'cvc', 'postalCode'].map((name) => (
                  <Field key={name} id={`card-${name}`} label={{ number: 'Card number', expiry: 'Expiry (MM/YY)', cvc: 'Security code', postalCode: 'Billing ZIP' }[name]} value={card[name]} onChange={(e) => setCard({ ...card, [name]: e.target.value })} />
                ))}
              </div>
            )}
            <Button pending={convert.pending} onClick={convert.execute}>
              Order {q.sites.filter((s) => s.serviceable).length} sites
            </Button>
          </div>
        )}
        {orders && (
          <div className="alert alert--success" role="status">
            <strong>{orders.length} orders placed.</strong>
            <ul>{orders.map((o) => <li key={o.orderNumber}><Link to={`/orders/${o.orderNumber}`}>{o.orderNumber}</Link> - {formatAddress(o.serviceAddress)}</li>)}</ul>
          </div>
        )}
        {['REQUESTED', 'PRICED', 'PENDING_APPROVAL'].includes(q.status) && (
          <p className="alert alert--info">Our business team is reviewing your quote. We will email {q.contactEmail} when it is ready.</p>
        )}
      </section>
      <aside>
        {q.pricing && <PriceSummary pricing={q.pricing} />}
      </aside>
    </div>
  );
}

export function TeamPage() {
  const { endpoints, user } = useAuth();
  const members = useAsync(() => endpoints.account.members(), []);
  const form = useForm(
    { firstName: '', lastName: '', email: '', role: 'BUSINESS_USER' },
    { firstName: [rules.required('First name')], lastName: [rules.required('Last name')], email: [rules.email()] },
  );
  const disable = useAction(async (id) => {
    await endpoints.account.disable(id);
    await members.reload();
  });
  const invite = form.handleSubmit(async (values) => {
    await endpoints.account.invite({ ...values, email: values.email.trim() });
    form.reset();
    await members.reload();
  });

  return (
    <div className="page grid-2">
      <section>
        <h1>Team</h1>
        <ProblemAlert error={members.error || disable.error} onRetry={members.error ? members.reload : undefined} />
        {members.data && (
          <ul className="members">
            {members.data.items.map((m) => (
              <li key={m.id}>
                {m.firstName} {m.lastName} ({m.email}) - {m.roles.join(', ')} <StatusBadge status={m.status} />
                {m.id !== user.id && m.status !== 'DISABLED' && (
                  <button type="button" className="btn btn--link" onClick={() => disable.execute(m.id)}>Disable</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <form onSubmit={invite} noValidate>
        <h2>Invite a colleague</h2>
        <Field label="First name" {...form.field('firstName')} />
        <Field label="Last name" {...form.field('lastName')} />
        <Field label="Email" type="email" {...form.field('email')} />
        <Field label="Role" as="select" {...form.field('role')}>
          <option value="BUSINESS_USER">User - can request quotes and view orders</option>
          <option value="BUSINESS_ADMIN">Admin - can also accept quotes and manage the team</option>
        </Field>
        <ProblemAlert error={form.formError} />
        <Button type="submit" pending={form.submitting}>Send invitation</Button>
      </form>
    </div>
  );
}
```

## apps/ecom-gokinetic/client/src/pages/checkout/CheckoutPage.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/checkout/CheckoutPage.jsx`.

```jsx
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
```

## apps/ecom-gokinetic/client/src/pages/checkout/steps.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/checkout/steps.jsx`.

```jsx
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
```

## apps/ecom-gokinetic/client/src/pages/checkout/steps.test.jsx

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: jsx. Path: `apps/ecom-gokinetic/client/src/pages/checkout/steps.test.jsx`.

```jsx
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
```

## apps/ecom-gokinetic/client/src/styles.css

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: css. Path: `apps/ecom-gokinetic/client/src/styles.css`.

```css
:root {
  --brand: #5b2be0;
  --brand-dark: #3d17a8;
  --ink: #1b1530;
  --muted: #6b6680;
  --line: #e3e0ee;
  --bg: #faf9fd;
  --ok: #157347;
  --warn: #9a6700;
  --danger: #b42318;
  --radius: 10px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--ink);
  background: var(--bg);
}

* { box-sizing: border-box; }
body { margin: 0; }
a { color: var(--brand); }
:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }

.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: absolute; left: -999px; }
.skip-link:focus { left: 1rem; top: 1rem; background: #fff; padding: .5rem; z-index: 10; }

.header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; background: #fff; border-bottom: 1px solid var(--line); }
.header__brand { font-weight: 800; font-size: 1.25rem; text-decoration: none; }
.header nav { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
.header nav a { text-decoration: none; color: var(--ink); }
.header nav a.active { color: var(--brand); font-weight: 600; }
.header__count { margin-left: .25rem; background: var(--brand); color: #fff; border-radius: 999px; padding: 0 .45rem; font-size: .8rem; }
.main { max-width: 1120px; margin: 0 auto; padding: 1.5rem; }
.footer { text-align: center; color: var(--muted); font-size: .85rem; padding: 2rem 1rem; }

.page--narrow { max-width: 460px; margin: 0 auto; }
.page--two-col { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 2rem; align-items: start; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 1.5rem; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
@media (max-width: 760px) {
  .page--two-col, .grid-2, .grid-3, .address-fields__row { grid-template-columns: 1fr; }
}

.field { display: flex; flex-direction: column; gap: .3rem; margin-bottom: 1rem; }
.field input, .field select, .field textarea { font: inherit; padding: .6rem .7rem; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
.field [aria-invalid="true"] { border-color: var(--danger); }
.field--checkbox { flex-direction: row; align-items: center; flex-wrap: wrap; }
.field__error { color: var(--danger); margin: 0; font-size: .9rem; flex-basis: 100%; }
.field__hint { color: var(--muted); margin: 0; font-size: .85rem; }
fieldset { border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem; margin: 0 0 1rem; }
.address-fields__row { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 1rem; }

.btn { font: inherit; border-radius: 999px; padding: .6rem 1.3rem; border: 1px solid transparent; cursor: pointer; text-decoration: none; display: inline-block; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.btn--primary { background: var(--brand); color: #fff; }
.btn--primary:hover:not(:disabled) { background: var(--brand-dark); }
.btn--secondary { background: #fff; color: var(--brand); border-color: var(--brand); }
.btn--danger { background: var(--danger); color: #fff; }
.btn--link { background: none; border: none; padding: 0; color: var(--brand); text-decoration: underline; }

.alert { border-radius: var(--radius); padding: .8rem 1rem; margin: 1rem 0; border: 1px solid; }
.alert p { margin: .25rem 0; }
.alert--error { background: #fef3f2; border-color: #fecdca; color: var(--danger); }
.alert--warning { background: #fffaeb; border-color: #fedf89; color: var(--warn); }
.alert--success { background: #ecfdf3; border-color: #abefc6; color: var(--ok); }
.alert--info { background: #f4f0ff; border-color: #d9ccff; }

.badge { display: inline-block; font-size: .75rem; font-weight: 600; padding: .1rem .55rem; border-radius: 999px; margin-left: .4rem; }
.badge--success { background: #dcfae6; color: var(--ok); }
.badge--danger { background: #fee4e2; color: var(--danger); }
.badge--attention { background: #fef0c7; color: var(--warn); }
.badge--muted { background: #eeecf3; color: var(--muted); }
.badge--info { background: #ebe5ff; color: var(--brand-dark); }

.plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.plan { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 1.25rem; display: flex; flex-direction: column; }
.plan--recommended { border: 2px solid var(--brand); }
.plan__flag { color: var(--brand); font-weight: 700; font-size: .8rem; text-transform: uppercase; margin: 0; }
.plan__speed { font-size: 1.4rem; font-weight: 700; margin: .25rem 0; }
.plan__speed span { font-size: .9rem; font-weight: 400; color: var(--muted); }
.plan__price strong { font-size: 1.6rem; }
.plan__install, .plan__unavailable { color: var(--muted); font-size: .9rem; }
.plan__features { padding-left: 1.1rem; flex: 1; }
.plan__actions { display: flex; justify-content: space-between; align-items: center; gap: .5rem; }

.toolbar { display: flex; align-items: center; gap: 1rem; margin: 1rem 0; flex-wrap: wrap; }
.toolbar h1 { margin-right: auto; }

.summary { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 1rem 1.25rem; }
.summary h3 { margin: .75rem 0 .25rem; font-size: 1rem; }
.summary dl { margin: 0; }
.summary__row { display: flex; justify-content: space-between; padding: .2rem 0; }
.summary__row dd { margin: 0; font-variant-numeric: tabular-nums; }
.summary__row--strong { font-weight: 700; border-top: 1px solid var(--line); margin-top: .25rem; padding-top: .4rem; }
.summary__note { color: var(--muted); font-size: .85rem; }
.summary__warning { color: var(--warn); font-size: .85rem; }

.cart-lines { list-style: none; padding: 0; }
.cart-line { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid var(--line); }
.cart-line__price { display: block; color: var(--muted); }
.terms label { margin-right: 1rem; }
.addon { display: flex; justify-content: space-between; align-items: center; padding: .4rem 0; }
.promo { display: flex; gap: .5rem; align-items: center; margin: 1rem 0; }

.stepper { display: flex; list-style: none; padding: 0; gap: .5rem; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
.stepper__step { padding: .3rem .8rem; border-radius: 999px; background: #eeecf3; font-size: .9rem; }
.stepper__step--current { background: var(--brand); color: #fff; }
.stepper__step--done { background: #dcfae6; }
.slots { display: grid; gap: .5rem; }
.slots__day { display: flex; align-items: center; gap: .5rem; }
.slots__date { width: 8rem; font-weight: 600; }
.slot { font: inherit; padding: .4rem .8rem; border-radius: 8px; border: 1px solid var(--line); background: #fff; cursor: pointer; }
.slot--selected { border-color: var(--brand); background: #f4f0ff; }
.review dt { font-weight: 600; margin-top: .6rem; }
.review dd { margin: 0; }

.table, .compare { width: 100%; border-collapse: collapse; background: #fff; }
.table th, .table td, .compare th, .compare td { text-align: left; padding: .6rem .7rem; border-bottom: 1px solid var(--line); }
.table-scroll { overflow-x: auto; }
.tabs { display: flex; gap: 1rem; border-bottom: 1px solid var(--line); margin-bottom: 1rem; }
.tabs a { padding: .5rem 0; text-decoration: none; color: var(--muted); }
.tabs a.active { color: var(--brand); border-bottom: 2px solid var(--brand); }
.pagination { display: flex; gap: 1rem; align-items: center; justify-content: center; margin: 1rem 0; }
.timeline ol { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; }
.timeline__step { border-top: 4px solid var(--line); padding-top: .5rem; display: flex; flex-direction: column; }
.timeline__step--complete { border-color: var(--ok); }
.timeline__step--current { border-color: var(--brand); }
.timeline__state, .timeline__date { color: var(--muted); font-size: .85rem; }
.danger-zone { border: 1px solid #fecdca; border-radius: var(--radius); padding: 1rem; margin-top: 2rem; }
.empty { text-align: center; padding: 3rem 1rem; color: var(--muted); }
.spinner { width: 2rem; height: 2rem; border: 3px solid var(--line); border-top-color: var(--brand); border-radius: 50%; animation: spin .8s linear infinite; margin: 2rem auto; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
```

## apps/ecom-gokinetic/client/src/test/setup.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/src/test/setup.js`.

```javascript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
```

## apps/ecom-gokinetic/client/vite.config.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/client/vite.config.js`.

```javascript
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: false,
    },
  };
});
```

## apps/ecom-gokinetic/server/.env.example

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: bash. Path: `apps/ecom-gokinetic/server/.env.example`.

```bash
# --- Runtime ---
NODE_ENV=development
PORT=4000
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173

# --- MongoDB ---
MONGODB_URI=mongodb://localhost:27017/ecom_gokinetic

# --- Auth (OIDC-compatible bearer JWT) ---
JWT_SECRET=change-me-to-a-long-random-string
JWT_ISSUER=https://auth.gokinetic.example
JWT_AUDIENCE=ecom-gokinetic-api
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=1209600

# --- Rate limiting ---
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
RATE_LIMIT_AUTH_MAX=10

# --- Commerce ---
DEFAULT_CURRENCY=USD
CART_TTL_HOURS=72
QUOTE_VALIDITY_DAYS=30
QUOTE_APPROVAL_DISCOUNT_BPS=1500

# --- Payment gateway ---
PAYMENT_GATEWAY_BASE_URL=https://payments.sandbox.example/v2
PAYMENT_GATEWAY_API_KEY=
PAYMENT_GATEWAY_TIMEOUT_MS=8000

# --- Serviceability API ---
SERVICEABILITY_API_BASE_URL=https://serviceability.sandbox.example/v1
SERVICEABILITY_API_KEY=
SERVICEABILITY_CACHE_TTL_HOURS=24

# --- Email notifier ---
EMAIL_API_BASE_URL=https://mail.sandbox.example/v3
EMAIL_API_KEY=
EMAIL_FROM_ADDRESS=orders@gokinetic.example

# --- Background jobs ---
JOBS_ENABLED=true
JOB_ORDER_VALIDATION_INTERVAL_MS=60000
JOB_ABANDONED_CART_INTERVAL_MS=900000
JOB_QUOTE_EXPIRY_INTERVAL_MS=3600000
JOB_BILLING_INTERVAL_MS=21600000
ABANDONED_CART_IDLE_HOURS=24

# --- Public URLs used in emails ---
STOREFRONT_BASE_URL=http://localhost:5173
BUSINESS_PORTAL_BASE_URL=http://localhost:5173/business

# --- Billing / accounts ---
BILLING_CONSUMER_DUE_DAYS=14
MAX_USERS_PER_BUSINESS_ACCOUNT=50
```

## apps/ecom-gokinetic/server/Dockerfile

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: dockerfile. Path: `apps/ecom-gokinetic/server/Dockerfile`.

```dockerfile
# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["node", "src/server.js"]
```

## apps/ecom-gokinetic/server/package.json

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: json. Path: `apps/ecom-gokinetic/server/package.json`.

```json
{
  "name": "@uniti/ecom-gokinetic-server",
  "version": "1.0.0",
  "private": true,
  "description": "GoKinetic / Business GoKinetic eCom API: catalogue, serviceability, cart, checkout, orders, quotes.",
  "main": "src/server.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "seed": "node src/scripts/seedCatalog.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.4.1"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "roots": [
      "<rootDir>/src",
      "<rootDir>/tests"
    ],
    "collectCoverageFrom": [
      "src/**/*.js",
      "!src/server.js",
      "!src/scripts/**"
    ]
  }
}
```

## apps/ecom-gokinetic/server/src/app.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/app.js`.

```javascript
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { correlationId, CORRELATION_HEADER } = require('./middleware/correlationId');
const { requestLogger } = require('./middleware/requestLogger');
const { rateLimit } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { IDEMPOTENCY_HEADER } = require('./middleware/idempotency');
const { CART_TOKEN_HEADER } = require('./controllers/cartController');
const { createApiRouter } = require('./routes');
const { createHealthRouter } = require('./routes/healthRoutes');

const API_PREFIX = '/api/v1';
const BODY_LIMIT = '100kb';

/**
 * Builds the Express application. No I/O happens here, so tests can create
 * an app around an in-memory container.
 *
 * @param {object} params
 * @param {object} params.container from createContainer()
 * @param {() => boolean} [params.isDatabaseReady]
 * @param {object} [params.scheduler]
 */
function createApp({ container, isDatabaseReady = () => true, scheduler }) {
  const { config } = container;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  // Correlation id first so every later log line (including errors) has it.
  app.use(correlationId());
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type', CORRELATION_HEADER, IDEMPOTENCY_HEADER, CART_TOKEN_HEADER],
      exposedHeaders: [
        CORRELATION_HEADER,
        CART_TOKEN_HEADER,
        'Location',
        'Retry-After',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Idempotent-Replayed',
      ],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT, type: ['application/json', 'application/*+json'] }));
  app.use(requestLogger({ ignorePaths: [`${API_PREFIX}/health`, `${API_PREFIX}/health/ready`] }));
  app.use(API_PREFIX, rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }));

  const healthRouter = createHealthRouter({ isDatabaseReady, scheduler });
  app.use(API_PREFIX, createApiRouter({ container, healthRouter }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, API_PREFIX };
```

## apps/ecom-gokinetic/server/src/config/db.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/config/db.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { logger } = require('./logger');

mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB with bounded retries and exponential back-off.
 * @param {string} uri
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
 */
async function connectDatabase(uri, { maxAttempts = 5, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 20,
        autoIndex: process.env.NODE_ENV !== 'production',
      });
      logger.info('mongo.connected', { host: mongoose.connection.host, attempt });
      return mongoose.connection;
    } catch (err) {
      if (attempt >= maxAttempts) {
        logger.error('mongo.connect_failed', { attempt, error: err });
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn('mongo.connect_retry', { attempt, delayMs: delay, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('mongo.disconnected');
}

/** True when the default connection is in the `connected` state. */
function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };
```

## apps/ecom-gokinetic/server/src/config/index.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/config/index.js`.

```javascript
'use strict';

/**
 * Centralised, validated runtime configuration.
 *
 * Every value is read from environment variables (see `.env.example`). Nothing
 * secret has a default: missing secrets fail fast at boot in production and
 * fall back to obviously-unsafe development placeholders elsewhere.
 */

require('dotenv').config();

const env = process.env;

function readString(name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function readInt(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

function readBool(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function readList(name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = readString('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

function requireSecret(name, devFallback) {
  const value = readString(name, undefined);
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required secret environment variable ${name}`);
  }
  return devFallback;
}

const config = Object.freeze({
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: readInt('PORT', 4000),
  logLevel: readString('LOG_LEVEL', 'info'),
  corsOrigins: readList('CORS_ORIGINS', ['http://localhost:5173']),

  mongo: Object.freeze({
    uri: readString('MONGODB_URI', 'mongodb://localhost:27017/ecom_gokinetic'),
  }),

  auth: Object.freeze({
    jwtSecret: requireSecret('JWT_SECRET', 'dev-only-insecure-secret'),
    issuer: readString('JWT_ISSUER', 'https://auth.gokinetic.example'),
    audience: readString('JWT_AUDIENCE', 'ecom-gokinetic-api'),
    accessTtlSeconds: readInt('JWT_ACCESS_TTL_SECONDS', 900),
    refreshTtlSeconds: readInt('JWT_REFRESH_TTL_SECONDS', 1209600),
    bcryptRounds: readInt('BCRYPT_ROUNDS', 12),
  }),

  rateLimit: Object.freeze({
    windowMs: readInt('RATE_LIMIT_WINDOW_MS', 60000),
    max: readInt('RATE_LIMIT_MAX', 120),
    authMax: readInt('RATE_LIMIT_AUTH_MAX', 10),
  }),

  commerce: Object.freeze({
    currency: readString('DEFAULT_CURRENCY', 'USD'),
    cartTtlHours: readInt('CART_TTL_HOURS', 72),
    quoteValidityDays: readInt('QUOTE_VALIDITY_DAYS', 30),
    quoteApprovalDiscountBps: readInt('QUOTE_APPROVAL_DISCOUNT_BPS', 1500),
  }),

  paymentGateway: Object.freeze({
    baseUrl: readString('PAYMENT_GATEWAY_BASE_URL', 'https://payments.sandbox.example/v2'),
    apiKey: requireSecret('PAYMENT_GATEWAY_API_KEY', 'sandbox-key'),
    timeoutMs: readInt('PAYMENT_GATEWAY_TIMEOUT_MS', 8000),
  }),

  serviceability: Object.freeze({
    baseUrl: readString('SERVICEABILITY_API_BASE_URL', 'https://serviceability.sandbox.example/v1'),
    apiKey: requireSecret('SERVICEABILITY_API_KEY', 'sandbox-key'),
    cacheTtlHours: readInt('SERVICEABILITY_CACHE_TTL_HOURS', 24),
    timeoutMs: readInt('SERVICEABILITY_API_TIMEOUT_MS', 5000),
  }),

  email: Object.freeze({
    baseUrl: readString('EMAIL_API_BASE_URL', 'https://mail.sandbox.example/v3'),
    apiKey: requireSecret('EMAIL_API_KEY', 'sandbox-key'),
    fromAddress: readString('EMAIL_FROM_ADDRESS', 'orders@gokinetic.example'),
    timeoutMs: readInt('EMAIL_API_TIMEOUT_MS', 5000),
  }),

  jobs: Object.freeze({
    enabled: readBool('JOBS_ENABLED', true),
    orderValidationIntervalMs: readInt('JOB_ORDER_VALIDATION_INTERVAL_MS', 60000),
    abandonedCartIntervalMs: readInt('JOB_ABANDONED_CART_INTERVAL_MS', 900000),
    quoteExpiryIntervalMs: readInt('JOB_QUOTE_EXPIRY_INTERVAL_MS', 3600000),
    billingIntervalMs: readInt('JOB_BILLING_INTERVAL_MS', 21600000),
    abandonedCartIdleHours: readInt('ABANDONED_CART_IDLE_HOURS', 24),
  }),

  urls: Object.freeze({
    storefront: readString('STOREFRONT_BASE_URL', 'http://localhost:5173'),
    businessPortal: readString('BUSINESS_PORTAL_BASE_URL', 'http://localhost:5173/business'),
  }),

  billing: Object.freeze({
    consumerDueDays: readInt('BILLING_CONSUMER_DUE_DAYS', 14),
    maxUsersPerBusinessAccount: readInt('MAX_USERS_PER_BUSINESS_ACCOUNT', 50),
  }),
});

module.exports = config;
```
