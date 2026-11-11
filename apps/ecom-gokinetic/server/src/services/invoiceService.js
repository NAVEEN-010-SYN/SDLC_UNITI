'use strict';

const { NotFoundError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../domain/constants');
const {
  INVOICE_STATUS,
  generateInvoiceNumber,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
} = require('../domain/billing');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const BILLING_PAGE_SIZE = 100;

/**
 * Issues and serves customer invoices.
 *
 * Generation is idempotent: the repository refuses a second invoice for the
 * same order/kind/period, so the billing job and order pipeline can safely
 * retry after a crash.
 */
function createInvoiceService({
  invoices,
  orders,
  accounts,
  consumerDueDays = 14,
  now = () => new Date(),
  log = logger,
}) {
  async function persist(body, { paid }) {
    const issuedAt = now();
    const account = await accounts.findByAccountId(body.accountId);
    const { invoice, created } = await invoices.createIfAbsent({
      ...body,
      invoiceNumber: generateInvoiceNumber(issuedAt),
      status: paid ? INVOICE_STATUS.PAID : INVOICE_STATUS.ISSUED,
      issuedAt,
      paidAt: paid ? issuedAt : null,
      dueAt: dueDate(issuedAt, { creditTermsDays: account ? account.creditTermsDays : 0, consumerDueDays }),
    });
    return { invoice, created };
  }

  function present(invoice) {
    return { ...invoice, displayStatus: displayStatus(invoice, now()) };
  }

  return {
    /**
     * Issues the checkout invoice once payment has been captured (or the
     * order is on account credit). Returns the invoice or null if nothing
     * was due.
     */
    async issueInitial(order) {
      const body = buildInitialInvoice(order);
      if (!body) return null;
      const paid = order.payment && order.payment.status === PAYMENT_STATUS.CAPTURED;
      const { invoice, created } = await persist(body, { paid });
      if (created) log.info('invoice.issued', { invoiceNumber: invoice.invoiceNumber, kind: body.kind, total: body.total });
      return invoice;
    },

    /**
     * Issues the RECURRING invoice for the period containing `asOf` for
     * every ACTIVE order. Returns counts for observability.
     */
    async runBillingCycle(asOf = now()) {
      let page = 1;
      let issued = 0;
      let skipped = 0;
      let failed = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await orders.list({ status: ORDER_STATUS.ACTIVE }, { page, pageSize: BILLING_PAGE_SIZE });
        for (const order of batch.items) {
          try {
            if (!order.activatedAt || new Date(order.activatedAt) > asOf) {
              skipped += 1;
              continue;
            }
            const { created } = await persist(buildRecurringInvoice(order, asOf), { paid: false });
            if (created) issued += 1;
            else skipped += 1;
          } catch (err) {
            failed += 1;
            log.error('invoice.billing_failed', { orderNumber: order.orderNumber, error: err });
          }
        }
        if (page * batch.pageSize >= batch.total) break;
        page += 1;
      }
      log.info('invoice.billing_cycle', { asOf: asOf.toISOString(), issued, skipped, failed });
      return { issued, skipped, failed };
    },

    /** Voids unpaid invoices when an order is cancelled or fails. */
    async voidForOrder(orderNumber) {
      const voided = await invoices.voidOpenForOrder(orderNumber);
      if (voided) log.info('invoice.voided', { orderNumber, count: voided });
      return voided;
    },

    async list(principal, query) {
      const isStaff = principal.roles.includes('SUPPORT_AGENT');
      const accountId = isStaff && query.accountId ? query.accountId : principal.accountId;
      const page = await invoices.list(
        { accountId, status: query.status, orderNumber: query.orderNumber },
        { page: query.page, pageSize: query.pageSize },
      );
      return { ...page, items: page.items.map(present) };
    },

    async get(principal, invoiceNumber) {
      const invoice = await invoices.findByNumber(invoiceNumber);
      if (!invoice || !canAccessAccountResource(principal, invoice.accountId, 'order:read:any')) {
        throw new NotFoundError('Invoice', invoiceNumber);
      }
      return present(invoice);
    },
  };
}

module.exports = { createInvoiceService };
