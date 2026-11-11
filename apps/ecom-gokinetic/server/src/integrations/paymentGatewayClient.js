'use strict';

const { createHttpClient } = require('./httpClient');
const { PaymentDeclinedError, UpstreamError } = require('../errors');

/**
 * Client for the card payment gateway.
 *
 * The storefront never sees card numbers: the browser tokenises the card with
 * the gateway's hosted fields and we receive an opaque `paymentToken`. We
 * authorise at checkout (due-today amount) and capture once the order is
 * validated, voiding the authorisation if validation fails.
 *
 * Every mutating call carries an Idempotency-Key derived from the order
 * number so retries never double-charge.
 */

const DECLINE_MESSAGES = {
  insufficient_funds: 'The card has insufficient funds.',
  card_expired: 'The card has expired.',
  do_not_honor: 'The card issuer declined the payment.',
  invalid_cvc: 'The security code is incorrect.',
  fraud_suspected: 'The payment could not be processed. Please contact your bank.',
};

function createPaymentGatewayClient({ baseUrl, apiKey, timeoutMs, http } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'payment-gateway',
      baseUrl,
      timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
      maxRetries: 2,
    });

  function toDecline(data) {
    const code = (data && data.decline_code) || 'do_not_honor';
    return new PaymentDeclinedError(DECLINE_MESSAGES[code] || DECLINE_MESSAGES.do_not_honor, {
      declineCode: code,
    });
  }

  return {
    /**
     * Places a hold for `amount` minor units.
     * @returns {Promise<{reference: string, status: string, last4: string|null, brand: string|null}>}
     */
    async authorize({ orderNumber, amount, currency, paymentToken, customerEmail }) {
      if (amount === 0) {
        return { reference: null, status: 'NOT_REQUIRED', last4: null, brand: null };
      }
      const res = await client.post(
        '/authorizations',
        {
          amount,
          currency,
          payment_token: paymentToken,
          reference: orderNumber,
          receipt_email: customerEmail,
          capture: false,
        },
        {
          headers: { 'Idempotency-Key': `auth-${orderNumber}` },
          retryable: true,
          expectedStatuses: [402],
        },
      );
      if (res.status === 402 || (res.data && res.data.status === 'declined')) throw toDecline(res.data);
      if (!res.data || !res.data.id) {
        throw new UpstreamError('payment-gateway', 'Authorization response missing reference.');
      }
      return {
        reference: res.data.id,
        status: 'AUTHORIZED',
        last4: res.data.card ? res.data.card.last4 : null,
        brand: res.data.card ? res.data.card.brand : null,
      };
    },

    /** Captures a previous authorisation (optionally partial). */
    async capture({ reference, amount, orderNumber }) {
      const res = await client.post(
        `/authorizations/${encodeURIComponent(reference)}/capture`,
        { amount },
        { headers: { 'Idempotency-Key': `capture-${orderNumber}` }, retryable: true },
      );
      return { reference, capturedAmount: res.data && Number.isInteger(res.data.amount_captured) ? res.data.amount_captured : amount };
    },

    /** Releases an uncaptured hold. */
    async void({ reference, orderNumber }) {
      await client.post(
        `/authorizations/${encodeURIComponent(reference)}/void`,
        {},
        { headers: { 'Idempotency-Key': `void-${orderNumber}` }, retryable: true },
      );
      return { reference, status: 'VOIDED' };
    },

    /** Refunds a captured amount (full or partial). */
    async refund({ reference, amount, orderNumber, reason }) {
      const res = await client.post(
        '/refunds',
        { authorization: reference, amount, reason },
        { headers: { 'Idempotency-Key': `refund-${orderNumber}-${amount}` }, retryable: true },
      );
      return { refundId: res.data ? res.data.id : null, amount };
    },
  };
}

module.exports = { createPaymentGatewayClient, DECLINE_MESSAGES };
