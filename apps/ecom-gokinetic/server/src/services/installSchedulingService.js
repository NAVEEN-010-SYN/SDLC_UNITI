'use strict';

const { BusinessRuleError } = require('../errors');
const { listInstallSlots, preferredDateProblem, earliestInstallDate } = require('../domain/installWindows');

/**
 * Offers installation dates for a qualified address and vets the shopper's
 * preferred date before an order is placed.
 */
function createInstallSchedulingService({ serviceability, now = () => new Date() }) {
  return {
    async listSlots(checkId, { days = 14, segment } = {}) {
      const check = await serviceability.getCheck(checkId, { segment });
      if (!check.serviceable) {
        throw new BusinessRuleError('ADDRESS_NOT_SERVICEABLE', 'Fibre is not available at this address yet.');
      }
      return {
        checkId,
        requiresSiteSurvey: check.requiresSiteSurvey,
        earliestDate: earliestInstallDate(check, now()).toISOString().slice(0, 10),
        slots: listInstallSlots(check, now(), days),
      };
    },

    /**
     * Throws a 422 when the preferred date is not bookable for the cart's
     * serviceability check. A missing preference is always fine: the
     * field-force system then picks the first free slot.
     */
    async assertPreferredDate(checkId, preferredInstallDate) {
      if (!preferredInstallDate) return;
      const check = await serviceability.getCheck(checkId);
      const problem = preferredDateProblem(check, preferredInstallDate, now());
      if (problem) {
        throw new BusinessRuleError('INSTALL_DATE_UNAVAILABLE', problem, {
          earliestDate: earliestInstallDate(check, now()).toISOString().slice(0, 10),
        });
      }
    },
  };
}

module.exports = { createInstallSchedulingService };
