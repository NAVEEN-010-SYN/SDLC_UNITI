import { formatMoney, formatTerm } from '../lib/format';

function Row({ label, amount, credit, strong }) {
  if (!amount) return null;
  return (
    <div className={`summary__row${strong ? ' summary__row--strong' : ''}`}>
      <dt>{label}</dt>
      <dd>{credit ? `-${formatMoney(amount)}` : formatMoney(amount)}</dd>
    </div>
  );
}

/**
 * Breakdown of the server's pricing result (see domain/pricing.js):
 * what is due today and what the monthly bill will be. Every number comes
 * from the API; the client never recomputes prices.
 */
export function PriceSummary({ pricing }) {
  if (!pricing) return null;
  const { recurring, oneTime, promo, introductory } = pricing;
  return (
    <section className="summary" aria-label="Price summary">
      <h3>Monthly</h3>
      <dl>
        <Row label="Plan and add-ons" amount={recurring.subtotal} />
        <Row label={`${formatTerm(pricing.contractTermMonths)} discount`} amount={recurring.termDiscount} credit />
        <Row label={`Multi-site discount (${pricing.volumeDiscountBps / 100}%)`} amount={recurring.volumeDiscount} credit />
        <Row label="Negotiated discount" amount={recurring.negotiatedDiscount} credit />
        <Row label={`Promotion ${promo ? promo.code : ''}`} amount={recurring.promoDiscount} credit />
        <Row label="Estimated tax" amount={recurring.tax} />
        <div className="summary__row summary__row--strong">
          <dt>Monthly total</dt>
          <dd>{formatMoney(recurring.total)}</dd>
        </div>
      </dl>
      {introductory && introductory.freeMonths > 0 && (
        <p className="summary__note">
          Your first {introductory.freeMonths} month{introductory.freeMonths > 1 ? 's are' : ' is'} free. First bill:{' '}
          {formatMoney(pricing.firstMonthlyBill)}.
        </p>
      )}

      <h3>Due today</h3>
      <dl>
        <Row label="Equipment" amount={oneTime.hardware} />
        <Row label="Installation" amount={oneTime.installation} />
        <Row label="Installation waived" amount={oneTime.installationWaived} credit />
        <Row label="Promotion" amount={oneTime.promoDiscount} credit />
        <Row label="Estimated tax" amount={oneTime.tax} />
        <div className="summary__row summary__row--strong">
          <dt>Due today</dt>
          <dd>{formatMoney(pricing.dueToday)}</dd>
        </div>
      </dl>
      {pricing.totalContractValue != null && (
        <p className="summary__note">Total over {pricing.contractTermMonths} months: {formatMoney(pricing.totalContractValue)}</p>
      )}
      {promo && !promo.applied && promo.reason && (
        <p className="summary__warning">Promo {promo.code} does not reduce this order.</p>
      )}
    </section>
  );
}
