/**
 * Card tokenisation against the payment gateway's public endpoint.
 *
 * Card numbers go straight from the browser to the gateway with the
 * publishable key and never reach the GoKinetic API, which only receives
 * the opaque token (keeps the storefront out of PCI DSS scope for card data).
 */

const TOKENIZE_URL = import.meta.env.VITE_PAYMENT_TOKENIZE_URL;
const PUBLISHABLE_KEY = import.meta.env.VITE_PAYMENT_PUBLISHABLE_KEY;

/** Luhn checksum used for instant feedback before calling the gateway. */
export function luhnValid(number) {
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(number) {
  const digits = String(number).replace(/\D/g, '');
  if (/^4/.test(digits)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(011|5)/.test(digits)) return 'discover';
  return 'unknown';
}

/** Returns field errors for the card form, or {} when it can be submitted. */
export function validateCard({ number, expiry, cvc, postalCode }, now = new Date()) {
  const errors = {};
  if (!luhnValid(number)) errors.number = 'Enter a valid card number.';
  const match = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(expiry || '').trim());
  if (!match) {
    errors.expiry = 'Use MM/YY.';
  } else {
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const endOfMonth = new Date(Date.UTC(year, month, 1));
    if (month < 1 || month > 12) errors.expiry = 'Use MM/YY.';
    else if (endOfMonth <= now) errors.expiry = 'This card has expired.';
  }
  const cvcLength = cardBrand(number) === 'amex' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(String(cvc || ''))) errors.cvc = `Enter the ${cvcLength}-digit security code.`;
  if (!/^\d{5}$/.test(String(postalCode || ''))) errors.postalCode = 'Enter the billing ZIP code.';
  return errors;
}

/**
 * @returns {Promise<{token: string, last4: string, brand: string}>}
 */
export async function tokenizeCard(card, { fetchImpl = (...a) => globalThis.fetch(...a) } = {}) {
  if (!TOKENIZE_URL || !PUBLISHABLE_KEY) {
    throw new Error('Card payments are not configured for this environment.');
  }
  const [month, year] = card.expiry.split('/').map((s) => s.trim());
  const response = await fetchImpl(TOKENIZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PUBLISHABLE_KEY}` },
    body: JSON.stringify({
      card: { number: card.number.replace(/\D/g, ''), exp_month: Number(month), exp_year: 2000 + Number(year), cvc: card.cvc },
      billing: { postal_code: card.postalCode },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    throw new Error(body.error?.message || 'Your card could not be verified. Check the details and try again.');
  }
  return { token: body.id, last4: body.card?.last4 || card.number.slice(-4), brand: body.card?.brand || cardBrand(card.number) };
}
