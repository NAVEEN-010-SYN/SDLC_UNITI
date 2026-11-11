'use strict';

const { createHttpClient } = require('./httpClient');
const { render } = require('./emailTemplates');
const { logger } = require('../config/logger');

/**
 * Sends transactional email through the provider's REST API and records
 * every attempt in the email log.
 *
 * Email is best-effort: failures are logged and recorded but never propagate
 * to the caller, so a provider outage cannot fail an order placement.
 */
function createEmailNotifier({ baseUrl, apiKey, fromAddress, timeoutMs, http, emailLog, log = logger } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'email-provider',
      baseUrl,
      timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
      maxRetries: 1,
    });

  /**
   * @param {object} params
   * @param {string} params.template template name
   * @param {string} params.to recipient
   * @param {string} params.reference business reference for de-duplication
   * @param {object} params.data template data
   * @param {boolean} [params.dedupe] skip if already sent for this reference
   * @returns {Promise<{sent: boolean, skipped?: boolean}>}
   */
  async function send({ template, to, reference, data, dedupe = false }) {
    if (dedupe && emailLog && (await emailLog.wasSent(template, reference))) {
      return { sent: false, skipped: true };
    }
    const { subject, text, html } = render(template, data);
    try {
      const res = await client.post(
        '/messages',
        { from: fromAddress, to: [to], subject, text, html, tags: [template], metadata: { reference } },
        { retryable: true, headers: { 'Idempotency-Key': `${template}-${reference}` } },
      );
      if (emailLog) {
        await emailLog.record({
          template,
          to,
          reference,
          status: 'SENT',
          providerMessageId: res.data ? res.data.id : undefined,
        });
      }
      log.info('email.sent', { template, reference });
      return { sent: true };
    } catch (err) {
      log.warn('email.failed', { template, reference, error: err.message });
      if (emailLog) {
        await emailLog.record({ template, to, reference, status: 'FAILED', error: err.message }).catch(() => {});
      }
      return { sent: false };
    }
  }

  return { send };
}

module.exports = { createEmailNotifier };
