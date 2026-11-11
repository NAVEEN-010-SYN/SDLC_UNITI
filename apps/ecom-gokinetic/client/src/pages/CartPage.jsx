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
