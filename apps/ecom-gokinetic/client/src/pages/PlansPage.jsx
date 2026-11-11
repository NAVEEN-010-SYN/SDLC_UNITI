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
