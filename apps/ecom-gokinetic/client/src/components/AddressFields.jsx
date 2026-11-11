import { Field } from './ui';
import { US_STATES } from '../lib/validation';

/**
 * Street address inputs bound to a useForm instance under `prefix`.
 * Reused by the availability check, checkout billing address and account
 * address book.
 */
export function AddressFields({ form, prefix = 'address', legend = 'Address' }) {
  const f = (name) => form.field(`${prefix}.${name}`);
  return (
    <fieldset className="address-fields">
      <legend>{legend}</legend>
      <Field label="Street address" autoComplete="address-line1" {...f('line1')} />
      <Field label="Apartment, suite, unit (optional)" autoComplete="address-line2" {...f('line2')} />
      <div className="address-fields__row">
        <Field label="City" autoComplete="address-level2" {...f('city')} />
        <Field label="State" as="select" autoComplete="address-level1" {...f('state')}>
          <option value="">Select</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Field>
        <Field label="ZIP code" inputMode="numeric" autoComplete="postal-code" {...f('postalCode')} />
      </div>
    </fieldset>
  );
}

export const EMPTY_ADDRESS = { line1: '', line2: '', city: '', state: '', postalCode: '' };
