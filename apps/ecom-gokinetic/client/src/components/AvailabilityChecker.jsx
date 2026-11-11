import { useForm } from '../hooks/useForm';
import { addressSchema, trimAddress } from '../lib/validation';
import { formatAddress, formatSpeed } from '../lib/format';
import { AddressFields, EMPTY_ADDRESS } from './AddressFields';
import { Button, ProblemAlert } from './ui';

const REASONS = {
  ADDRESS_NOT_FOUND: 'We could not find that address. Check the street and ZIP code.',
  NOT_QUALIFIED: 'Our fibre network does not reach this address yet.',
};

/**
 * Address entry + result banner. Calls `onCheck(address)` which must return
 * the serviceability check.
 */
export function AvailabilityChecker({ availability, segment }) {
  const form = useForm({ address: availability.address || EMPTY_ADDRESS }, addressSchema('address'));
  const { check } = availability;

  const submit = form.handleSubmit(async ({ address }) => {
    await availability.runCheck(trimAddress(address), segment);
  });

  return (
    <section className="availability" aria-labelledby="availability-title">
      <h2 id="availability-title">Check fibre availability</h2>
      {check ? (
        <div className={`alert ${check.serviceable ? 'alert--success' : 'alert--warning'}`} role="status">
          <p>
            <strong>{formatAddress(check.address)}</strong>
          </p>
          {check.serviceable ? (
            <p>
              Great news: speeds up to {formatSpeed(check.maxDownloadMbps)} are available.
              {check.requiresSiteSurvey && ' A short site survey is needed before installation.'}
            </p>
          ) : (
            <p>{REASONS[check.reasonCode] || REASONS.NOT_QUALIFIED}</p>
          )}
          <button type="button" className="btn btn--link" onClick={availability.clear}>
            Check a different address
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <AddressFields form={form} legend="Service address" />
          <ProblemAlert error={form.formError} />
          <Button type="submit" pending={form.submitting}>
            Check availability
          </Button>
        </form>
      )}
    </section>
  );
}
