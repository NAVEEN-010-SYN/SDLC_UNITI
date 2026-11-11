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
