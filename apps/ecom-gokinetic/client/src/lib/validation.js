/**
 * Client-side form validation mirroring the API's boundary rules, so most
 * mistakes are caught before a round trip. The server remains the source of
 * truth: its problem+json field errors are merged into the same shape.
 *
 * Validators return an error message string or null.
 */

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];

const STATE_SET = new Set(US_STATES);

export const rules = {
  required: (label) => (v) => (String(v ?? '').trim() ? null : `${label} is required.`),
  minLength: (n, label) => (v) => (String(v ?? '').trim().length >= n ? null : `${label} must be at least ${n} characters.`),
  email: () => (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) ? null : 'Enter a valid email address.'),
  phone: () => (v) => (/^\+?1?\d{10}$/.test(String(v ?? '').replace(/[\s().-]/g, '')) ? null : 'Enter a 10-digit US phone number.'),
  zip: () => (v) => (/^\d{5}(-\d{4})?$/.test(String(v ?? '').trim()) ? null : 'Enter a 5-digit ZIP code.'),
  state: () => (v) => (STATE_SET.has(String(v ?? '').trim().toUpperCase()) ? null : 'Choose a state.'),
  password: () => (v) => {
    const s = String(v ?? '');
    if (s.length < 10) return 'Use at least 10 characters.';
    if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s)) return 'Include upper and lower case letters and a digit.';
    return null;
  },
  matches: (otherField, message) => (v, values) => (v === values[otherField] ? null : message),
  checked: (message) => (v) => (v === true ? null : message),
};

/**
 * Runs a schema `{ field: [rule, ...] }` (dotted paths supported) and returns
 * `{ 'field': message }` for the first failing rule of each field.
 */
export function validateValues(schema, values) {
  const errors = {};
  for (const [path, fieldRules] of Object.entries(schema)) {
    const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), values);
    for (const rule of fieldRules) {
      const message = rule(value, values);
      if (message) {
        errors[path] = message;
        break;
      }
    }
  }
  return errors;
}

/** Schema for an address nested under `prefix` (e.g. "address"). */
export function addressSchema(prefix = 'address') {
  const p = prefix ? `${prefix}.` : '';
  return {
    [`${p}line1`]: [rules.required('Street address'), rules.minLength(3, 'Street address')],
    [`${p}city`]: [rules.required('City'), rules.minLength(2, 'City')],
    [`${p}state`]: [rules.state()],
    [`${p}postalCode`]: [rules.zip()],
  };
}

/** Normalises a phone number to the digits-only form the API expects. */
export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function trimAddress(address) {
  return {
    line1: address.line1.trim(),
    ...(address.line2 && address.line2.trim() ? { line2: address.line2.trim() } : {}),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
    postalCode: address.postalCode.trim(),
  };
}
