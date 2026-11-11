'use strict';

const { NotFoundError, ForbiddenError, BusinessRuleError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS, PRODUCT_TYPES } = require('../domain/constants');
const { orderStateMachine } = require('../domain/stateMachine');
const { buildTimeline, isSelfCancellable } = require('../domain/orderTracking');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const NOTIFY_ON = new Set([
  ORDER_STATUS.VALIDATED,
  ORDER_STATUS.PROVISIONING,
  ORDER_STATUS.ACTIVE,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FAILED,
]);

/**
 * Order queries, customer cancellation, back-office status changes and the
 * post-submission validation pipeline used by the background job.
 */
function createOrderService({
  orders,
  accounts,
  products,
  promoService,
  paymentGateway,
  serviceability,
  serviceabilityApi,
  notifier,
  now = () => new Date(),
  log = logger,
}) {
  async function loadAuthorized(principal, orderNumber) {
    const order = await orders.findByNumber(orderNumber);
    if (!order) throw new NotFoundError('Order', orderNumber);
    if (!canAccessAccountResource(principal, order.accountId, 'order:read:any')) {
      // Do not leak existence of other accounts' orders.
      throw new NotFoundError('Order', orderNumber);
    }
    return order;
  }

  async function notify(order, status) {
    if (!NOTIFY_ON.has(status)) return;
    await notifier.send({
      template: 'ORDER_STATUS_CHANGED',
      to: order.contact.email,
      reference: `${order.orderNumber}:${status}`,
      data: { order, status },
      dedupe: true,
    });
  }

  /**
   * Returns money to the customer according to how far payment progressed:
   * void an authorisation, refund a capture, nothing otherwise.
   */
  async function settlePaymentOnExit(order, reason) {
    const p = order.payment || {};
    if (p.status === PAYMENT_STATUS.AUTHORIZED && p.gatewayReference) {
      await paymentGateway.void({ reference: p.gatewayReference, orderNumber: order.orderNumber });
      return { status: PAYMENT_STATUS.VOIDED };
    }
    if (p.status === PAYMENT_STATUS.CAPTURED && p.gatewayReference && p.capturedAmount > 0) {
      const refundable = p.capturedAmount - (p.refundedAmount || 0);
      if (refundable > 0) {
        await paymentGateway.refund({
          reference: p.gatewayReference,
          amount: refundable,
          orderNumber: order.orderNumber,
          reason,
        });
      }
      return { status: PAYMENT_STATUS.REFUNDED, refundedAmount: p.capturedAmount };
    }
    return null;
  }

  async function releaseResources(order) {
    const hardware = order.items.filter((i) => i.productType === PRODUCT_TYPES.HARDWARE);
    await Promise.all(hardware.map((i) => products.releaseStock(i.sku, i.quantity)));
    if (order.promoCode) await promoService.reverse(order.orderNumber);
  }

  /**
   * Applies a validated transition with compare-and-set semantics.
   * @returns {Promise<object>} updated order
   */
  async function applyTransition(order, to, { actor = 'system', reason, patch = {} } = {}) {
    const entry = orderStateMachine.transition(order, to, { actor, reason, at: now() });
    const updated = await orders.transition(order.orderNumber, order.status, entry, patch);
    if (!updated) {
      throw new BusinessRuleError('ORDER_CHANGED', 'The order changed while it was being updated. Reload and retry.');
    }
    log.info('order.transition', { orderNumber: order.orderNumber, from: order.status, to, actor });
    await notify(updated, to);
    return updated;
  }

  /** Exit path shared by cancellation and failure. */
  async function exitOrder(order, to, { actor, reason }) {
    const payment = await settlePaymentOnExit(order, reason);
    const patch = to === ORDER_STATUS.CANCELLED ? { cancellationReason: reason } : { failureReason: reason };
    if (payment) {
      patch['payment.status'] = payment.status;
      if (payment.refundedAmount) patch['payment.refundedAmount'] = payment.refundedAmount;
    }
    const updated = await applyTransition(order, to, { actor, reason, patch });
    await releaseResources(order);
    return updated;
  }

  return {
    async list(principal, query) {
      const accountId = principal.roles.includes('SUPPORT_AGENT') && query.accountId ? query.accountId : principal.accountId;
      return orders.list({ accountId, status: query.status }, { page: query.page, pageSize: query.pageSize });
    },

    async get(principal, orderNumber) {
      return loadAuthorized(principal, orderNumber);
    },

    /** Order plus tracking timeline. */
    async track(principal, orderNumber) {
      const order = await loadAuthorized(principal, orderNumber);
      let estimatedInstallDays = null;
      if (order.serviceabilityCheckId) {
        const check = await serviceability.getCheck(order.serviceabilityCheckId).catch(() => null);
        estimatedInstallDays = check ? check.estimatedInstallDays : null;
      }
      return {
        orderNumber: order.orderNumber,
        timeline: buildTimeline(order, { estimatedInstallDays }),
        canCancel: isSelfCancellable(order),
      };
    },

    async cancel(principal, orderNumber, { reason }) {
      const order = await loadAuthorized(principal, orderNumber);
      const isStaff = principal.roles.includes('SUPPORT_AGENT');
      if (!isStaff && order.accountId !== principal.accountId) throw new ForbiddenError();
      if (!isSelfCancellable(order)) {
        throw new BusinessRuleError(
          'ORDER_NOT_CANCELLABLE',
          'Installation is already under way. Please contact support to cancel this order.',
          { status: order.status },
        );
      }
      return exitOrder(order, ORDER_STATUS.CANCELLED, { actor: principal.id, reason });
    },

    /** Back-office manual status change. */
    async advance(principal, orderNumber, { status, reason }) {
      const order = await orders.findByNumber(orderNumber);
      if (!order) throw new NotFoundError('Order', orderNumber);
      if (status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FAILED) {
        return exitOrder(order, status, { actor: principal.id, reason: reason || `Set to ${status} by support` });
      }
      const patch = {};
      if (status === ORDER_STATUS.ACTIVE) patch.activatedAt = now();
      const updated = await applyTransition(order, status, { actor: principal.id, reason, patch });
      if (status === ORDER_STATUS.ACTIVE) {
        await accounts.update(order.accountId, { existingCustomer: true });
      }
      return updated;
    },

    /**
     * Validation pipeline for a SUBMITTED order (run by the background job):
     * re-qualify the address, capture payment, book the installation and move
     * the order to PROVISIONING. Any hard failure fails the order and returns
     * the customer's money.
     * @returns {Promise<{orderNumber: string, outcome: string}>}
     */
    async processSubmitted(order) {
      const fail = async (reason) => {
        await exitOrder(order, ORDER_STATUS.FAILED, { actor: 'order-validation-job', reason });
        return { orderNumber: order.orderNumber, outcome: 'FAILED', reason };
      };

      let check;
      try {
        check = await serviceability.check(order.serviceAddress, { segment: order.segment, forceRefresh: true });
        const planSkus = order.items.filter((i) => i.productType === PRODUCT_TYPES.PLAN).map((i) => i.sku);
        serviceability.assertPlansDeliverable(check, planSkus);
      } catch (err) {
        if (err instanceof BusinessRuleError) return fail(err.detail);
        throw err; // upstream outage: leave SUBMITTED, retry next run
      }

      let current = order;
      if (order.payment.status === PAYMENT_STATUS.AUTHORIZED) {
        try {
          const capture = await paymentGateway.capture({
            reference: order.payment.gatewayReference,
            amount: order.payment.authorizedAmount,
            orderNumber: order.orderNumber,
          });
          current = await orders.updatePayment(order.orderNumber, {
            status: PAYMENT_STATUS.CAPTURED,
            capturedAmount: capture.capturedAmount,
          });
        } catch (err) {
          if (err.status === 402) return fail('Payment capture was declined');
          throw err;
        }
      }

      current = await applyTransition(current, ORDER_STATUS.VALIDATED, {
        actor: 'order-validation-job',
        patch: { serviceabilityCheckId: check.checkId },
      });

      const slot = await serviceabilityApi
        .reserveInstallSlot({
          upstreamReference: check.upstreamReference || check.checkId,
          preferredDate: order.preferredInstallDate ? new Date(order.preferredInstallDate) : null,
          orderNumber: order.orderNumber,
        })
        .catch((err) => {
          log.warn('order.install_slot_failed', { orderNumber: order.orderNumber, error: err.message });
          return null;
        });
      if (!slot || !slot.scheduledFor) {
        return { orderNumber: order.orderNumber, outcome: 'VALIDATED' };
      }
      await applyTransition(current, ORDER_STATUS.PROVISIONING, {
        actor: 'order-validation-job',
        patch: { installAppointment: slot.scheduledFor },
      });
      return { orderNumber: order.orderNumber, outcome: 'PROVISIONING' };
    },
  };
}

module.exports = { createOrderService };
