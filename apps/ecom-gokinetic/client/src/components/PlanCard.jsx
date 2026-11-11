import { formatMoney, formatSpeed } from '../lib/format';
import { Button } from './ui';

/**
 * A plan tile. `availability` is 'available' | 'unavailable' | 'unknown'
 * (no address checked yet), which decides the call to action.
 */
export function PlanCard({ plan, availability = 'unknown', recommended, onSelect, onToggleCompare, comparing, pending }) {
  return (
    <article className={`plan${recommended ? ' plan--recommended' : ''}`} aria-labelledby={`plan-${plan.sku}`}>
      {recommended && <p className="plan__flag">Recommended for your address</p>}
      <h3 id={`plan-${plan.sku}`}>{plan.name}</h3>
      <p className="plan__speed">
        {formatSpeed(plan.speedMbps)}
        {plan.uploadMbps ? <span> / {formatSpeed(plan.uploadMbps)} upload</span> : null}
      </p>
      <p className="plan__price">
        <strong>{formatMoney(plan.monthlyPrice)}</strong>/mo
      </p>
      {plan.installationFee > 0 && (
        <p className="plan__install">Installation {formatMoney(plan.installationFee)} (free on 12+ month terms)</p>
      )}
      <ul className="plan__features">
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="plan__actions">
        {availability === 'unavailable' ? (
          <p className="plan__unavailable">Not available at your address</p>
        ) : (
          <Button onClick={() => onSelect(plan)} pending={pending}>
            {availability === 'available' ? 'Choose plan' : 'Check availability'}
          </Button>
        )}
        {onToggleCompare && (
          <label className="plan__compare">
            <input type="checkbox" checked={comparing} onChange={() => onToggleCompare(plan.sku)} /> Compare
          </label>
        )}
      </div>
    </article>
  );
}
