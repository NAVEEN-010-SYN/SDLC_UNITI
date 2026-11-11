'use strict';

const { ORDER_STATUS, PAYMENT_STATUS } = require('../domain/constants');
const { createScheduler } = require('./scheduler');
const { logger } = require('../config/logger');

const HOUR_MS = 3600 * 1000;
const ORDER_BATCH_SIZE = 50;

/**
 * Validates SUBMITTED orders (re-qualify, capture, book install) and issues
 * the checkout invoice for every order whose payment is settled.
 */
function orderValidationJob({ orders, orderService, invoiceService, log = logger }) {
  return async () => {
    const submitted = await orders.findByStatus(ORDER_STATUS.SUBMITTED, { limit: ORDER_BATCH_SIZE });
    const outcomes = { PROVISIONING: 0, VALIDATED: 0, FAILED: 0, ERROR: 0 };
    for (const order of submitted) {
      try {
        const { outcome } = await orderService.processSubmitted(order);
        outcomes[outcome] += 1;
        if (outcome === 'FAILED') {
          await invoiceService.voidForOrder(order.orderNumber);
          continue;
        }
        const fresh = await orders.findByNumber(order.orderNumber);
        const settled = [PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.NOT_REQUIRED].includes(fresh.payment.status);
        if (settled) await invoiceService.issueInitial(fresh);
      } catch (err) {
        // Upstream outage: the order stays SUBMITTED and is retried next run.
        outcomes.ERROR += 1;
        log.warn('job.order_validation_error', { orderNumber: order.orderNumber, error: err.message });
      }
    }
    return { scanned: submitted.length, ...outcomes };
  };
}

/**
 * Expires stale carts and emails a one-time reminder to signed-in shoppers
 * who opted into marketing and left items behind.
 */
function abandonedCartJob({ carts, users, notifier, storefrontUrl, idleHours, now = () => new Date() }) {
  return async () => {
    const expired = await carts.expireStale(now());
    const idleSince = new Date(now().getTime() - idleHours * HOUR_MS);
    const candidates = await carts.findAbandoned({ idleSince });
    let reminded = 0;
    for (const cart of candidates) {
      const user = await users.findById(cart.userId);
      // Mark even when not sent so ineligible carts are not rescanned forever.
      await carts.markReminderSent(cart.id, now());
      if (!user || user.status !== 'ACTIVE' || !user.marketingOptIn) continue;
      const result = await notifier.send({
        template: 'ABANDONED_CART',
        to: user.email,
        reference: `cart:${cart.id}`,
        data: { firstName: user.firstName, cart, resumeUrl: `${storefrontUrl}/cart?resume=${cart.id}` },
        dedupe: true,
      });
      if (result.sent) reminded += 1;
    }
    return { expired, candidates: candidates.length, reminded };
  };
}

/**
 * Builds the scheduler with every background job registered.
 * @param {ReturnType<import('../container').createContainer>} container
 */
function buildScheduler(container) {
  const { config, repos, notifier, services } = container;
  const scheduler = createScheduler();
  scheduler.register(
    'order-validation',
    config.jobs.orderValidationIntervalMs,
    orderValidationJob({
      orders: repos.orders,
      orderService: services.orderService,
      invoiceService: services.invoiceService,
    }),
  );
  scheduler.register(
    'abandoned-cart',
    config.jobs.abandonedCartIntervalMs,
    abandonedCartJob({
      carts: repos.carts,
      users: repos.users,
      notifier,
      storefrontUrl: config.urls.storefront,
      idleHours: config.jobs.abandonedCartIdleHours,
    }),
  );
  scheduler.register('quote-expiry', config.jobs.quoteExpiryIntervalMs, async () => ({
    expired: await services.quoteService.expireDue(),
  }));
  scheduler.register('billing', config.jobs.billingIntervalMs, () => services.invoiceService.runBillingCycle());
  return scheduler;
}

module.exports = { buildScheduler, orderValidationJob, abandonedCartJob };
