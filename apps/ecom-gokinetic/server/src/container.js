'use strict';

const { createProductRepository } = require('./repositories/productRepository');
const { createCartRepository } = require('./repositories/cartRepository');
const { createOrderRepository } = require('./repositories/orderRepository');
const { createPromoRepository } = require('./repositories/promoRepository');
const { createQuoteRepository } = require('./repositories/quoteRepository');
const { createInvoiceRepository } = require('./repositories/invoiceRepository');
const {
  createUserRepository,
  createAccountRepository,
  createSessionRepository,
} = require('./repositories/identityRepositories');
const {
  createServiceabilityRepository,
  createIdempotencyRepository,
  createEmailLogRepository,
} = require('./repositories/infraRepositories');

const { createPaymentGatewayClient } = require('./integrations/paymentGatewayClient');
const { createServiceabilityApiClient } = require('./integrations/serviceabilityApiClient');
const { createEmailNotifier } = require('./integrations/emailNotifier');

const { createAuthService } = require('./services/authService');
const { createCatalogService } = require('./services/catalogService');
const { createServiceabilityService } = require('./services/serviceabilityService');
const { createPromoService } = require('./services/promoService');
const { createCartService } = require('./services/cartService');
const { createCheckoutService } = require('./services/checkoutService');
const { createOrderService } = require('./services/orderService');
const { createQuoteService } = require('./services/quoteService');
const { createAccountService } = require('./services/accountService');
const { createInvoiceService } = require('./services/invoiceService');
const { createInstallSchedulingService } = require('./services/installSchedulingService');

/**
 * Composition root: wires repositories, upstream clients and services.
 *
 * `overrides` lets tests (or alternative deployments) swap any dependency by
 * name, e.g. `{ paymentGateway: fakeGateway }`, without touching the graph.
 *
 * @param {object} config validated runtime config (src/config)
 * @param {object} [overrides]
 */
function createContainer(config, overrides = {}) {
  const pick = (name, factory) => (overrides[name] !== undefined ? overrides[name] : factory());

  const repos = {
    products: pick('products', () => createProductRepository()),
    carts: pick('carts', () => createCartRepository()),
    orders: pick('orders', () => createOrderRepository()),
    promos: pick('promos', () => createPromoRepository()),
    quotes: pick('quotes', () => createQuoteRepository()),
    invoices: pick('invoices', () => createInvoiceRepository()),
    users: pick('users', () => createUserRepository()),
    accounts: pick('accounts', () => createAccountRepository()),
    sessions: pick('sessions', () => createSessionRepository()),
    serviceabilityChecks: pick('serviceabilityChecks', () => createServiceabilityRepository()),
    idempotency: pick('idempotency', () => createIdempotencyRepository()),
    emailLog: pick('emailLog', () => createEmailLogRepository()),
  };

  const paymentGateway = pick('paymentGateway', () => createPaymentGatewayClient(config.paymentGateway));
  const serviceabilityApi = pick('serviceabilityApi', () => createServiceabilityApiClient(config.serviceability));
  const notifier = pick('notifier', () => createEmailNotifier({ ...config.email, emailLog: repos.emailLog }));

  const authService = pick('authService', () =>
    createAuthService({ users: repos.users, accounts: repos.accounts, sessions: repos.sessions, authConfig: config.auth }),
  );
  const serviceability = pick('serviceabilityService', () =>
    createServiceabilityService({
      repository: repos.serviceabilityChecks,
      apiClient: serviceabilityApi,
      products: repos.products,
      cacheTtlHours: config.serviceability.cacheTtlHours,
    }),
  );
  const catalogService = pick('catalogService', () => createCatalogService({ products: repos.products, serviceability }));
  const promoService = pick('promoService', () => createPromoService({ promos: repos.promos, accounts: repos.accounts }));
  const cartService = pick('cartService', () =>
    createCartService({
      carts: repos.carts,
      products: repos.products,
      accounts: repos.accounts,
      serviceability,
      promoService,
      cartTtlHours: config.commerce.cartTtlHours,
    }),
  );
  const checkoutService = pick('checkoutService', () =>
    createCheckoutService({
      cartService,
      serviceability,
      products: repos.products,
      orders: repos.orders,
      promoService,
      paymentGateway,
      notifier,
    }),
  );
  const orderService = pick('orderService', () =>
    createOrderService({
      orders: repos.orders,
      accounts: repos.accounts,
      products: repos.products,
      promoService,
      paymentGateway,
      serviceability,
      serviceabilityApi,
      notifier,
    }),
  );
  const quoteService = pick('quoteService', () =>
    createQuoteService({
      quotes: repos.quotes,
      products: repos.products,
      orders: repos.orders,
      accounts: repos.accounts,
      serviceability,
      paymentGateway,
      notifier,
      approvalThresholdBps: config.commerce.quoteApprovalDiscountBps,
      validityDays: config.commerce.quoteValidityDays,
      portalBaseUrl: config.urls.businessPortal,
    }),
  );
  const accountService = pick('accountService', () =>
    createAccountService({
      users: repos.users,
      accounts: repos.accounts,
      serviceability,
      notifier,
      authConfig: config.auth,
      maxUsersPerBusinessAccount: config.billing.maxUsersPerBusinessAccount,
      businessPortalUrl: config.urls.businessPortal,
    }),
  );
  const invoiceService = pick('invoiceService', () =>
    createInvoiceService({
      invoices: repos.invoices,
      orders: repos.orders,
      accounts: repos.accounts,
      consumerDueDays: config.billing.consumerDueDays,
    }),
  );
  const installScheduling = pick('installScheduling', () => createInstallSchedulingService({ serviceability }));

  return {
    config,
    repos,
    notifier,
    services: {
      authService,
      serviceability,
      catalogService,
      promoService,
      cartService,
      checkoutService,
      orderService,
      quoteService,
      accountService,
      invoiceService,
      installScheduling,
    },
  };
}

module.exports = { createContainer };
