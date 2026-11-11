'use strict';

const { createHttpClient } = require('./httpClient');
const { UpstreamError } = require('../errors');

/**
 * Client for the network serviceability (address qualification) API.
 * Translates the upstream payload into the storefront's vocabulary so the
 * rest of the code never depends on upstream field names.
 */

const TECHNOLOGY_MAP = {
  GPON: 'FTTP',
  XGSPON: 'FTTP',
  VDSL: 'FTTC',
  FWA: 'FIXED_WIRELESS',
};

/**
 * @param {object} raw upstream response body
 * @returns {{serviceable: boolean, technology: string|null, maxDownloadMbps: number,
 *   maxUploadMbps: number, estimatedInstallDays: number|null, requiresSiteSurvey: boolean,
 *   reasonCode: string|null, upstreamReference: string|null}}
 */
function mapQualification(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new UpstreamError('serviceability-api', 'Empty qualification response.');
  }
  const best = Array.isArray(raw.offers)
    ? raw.offers.reduce((top, offer) => (!top || offer.max_down_mbps > top.max_down_mbps ? offer : top), null)
    : null;
  const serviceable = raw.qualification === 'QUALIFIED' && Boolean(best);
  return {
    serviceable,
    technology: best ? TECHNOLOGY_MAP[best.technology] || null : null,
    maxDownloadMbps: best ? best.max_down_mbps : 0,
    maxUploadMbps: best ? best.max_up_mbps : 0,
    estimatedInstallDays: Number.isInteger(raw.lead_time_days) ? raw.lead_time_days : null,
    requiresSiteSurvey: Boolean(raw.site_survey_required),
    reasonCode: serviceable ? null : raw.reason_code || 'NOT_QUALIFIED',
    upstreamReference: raw.qualification_id || null,
  };
}

function createServiceabilityApiClient({ baseUrl, apiKey, timeoutMs, http } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'serviceability-api',
      baseUrl,
      timeoutMs,
      headers: { 'X-Api-Key': apiKey },
      maxRetries: 2,
    });

  return {
    /**
     * Qualifies a normalised address.
     * @param {{line1:string,line2:string,city:string,state:string,postalCode:string}} address
     */
    async qualify(address) {
      const res = await client.post(
        '/qualifications',
        {
          address: {
            street: address.line1,
            unit: address.line2 || undefined,
            city: address.city,
            state: address.state,
            zip: address.postalCode,
          },
        },
        { retryable: true, expectedStatuses: [404] },
      );
      if (res.status === 404) {
        return {
          serviceable: false,
          technology: null,
          maxDownloadMbps: 0,
          maxUploadMbps: 0,
          estimatedInstallDays: null,
          requiresSiteSurvey: false,
          reasonCode: 'ADDRESS_NOT_FOUND',
          upstreamReference: null,
        };
      }
      return mapQualification(res.data);
    },

    /** Requests the earliest install appointment slot for a qualified address. */
    async reserveInstallSlot({ upstreamReference, preferredDate, orderNumber }) {
      const res = await client.post(
        '/appointments',
        {
          qualification_id: upstreamReference,
          preferred_date: preferredDate ? preferredDate.toISOString().slice(0, 10) : undefined,
          external_reference: orderNumber,
        },
        { retryable: true, headers: { 'Idempotency-Key': `appt-${orderNumber}` } },
      );
      return {
        appointmentId: res.data ? res.data.appointment_id : null,
        scheduledFor: res.data && res.data.start ? new Date(res.data.start) : null,
      };
    },
  };
}

module.exports = { createServiceabilityApiClient, mapQualification };
