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
