import { createServer } from 'node:http';
import { createApp } from './app';
import { createTokenVerifier } from './auth/jwt';
import { loadConfig } from './config/env';
import { createDb, createPool } from './db/query';
import { logger } from './lib/logger';
import { createAccountsRepository } from './modules/accounts/accounts.repository';
import { accountsRoutes } from './modules/accounts/accounts.routes';
import { AccountsService } from './modules/accounts/accounts.service';
import { createAuditRepository } from './modules/audit/audit.repository';
import { auditRoutes } from './modules/audit/audit.routes';
import { AuditService } from './modules/audit/audit.service';
import { createBillingRepository } from './modules/billing/billing.repository';
import { billingRoutes } from './modules/billing/billing.routes';
import { BillingService } from './modules/billing/billing.service';
import { createInventoryRepository } from './modules/inventory/inventory.repository';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { InventoryService } from './modules/inventory/inventory.service';
import { createOutbox, outboxInvitationSender, outboxTicketNotifier } from './modules/notifications/outbox';
import { createOrdersRepository } from './modules/orders/orders.repository';
import { ordersRoutes } from './modules/orders/orders.routes';
import { OrdersService } from './modules/orders/orders.service';
import { createHttpPaymentGateway } from './modules/payments/payment-gateway';
import { createPaymentMethodsRepository } from './modules/payments/payment-methods.repository';
import { paymentMethodsRoutes } from './modules/payments/payment-methods.routes';
import { PaymentMethodsService } from './modules/payments/payment-methods.service';
import { createSlaRepository } from './modules/sla/sla.repository';
import { slaRoutes } from './modules/sla/sla.routes';
import { SlaService } from './modules/sla/sla.service';
import { createTicketsRepository } from './modules/tickets/tickets.repository';
import { ticketsRoutes } from './modules/tickets/tickets.routes';
import { TicketsService } from './modules/tickets/tickets.service';
import { createUsersRepository } from './modules/users/users.repository';
import { usersRoutes } from './modules/users/users.routes';
import { UsersService } from './modules/users/users.service';

const SHUTDOWN_GRACE_MS = 15_000;

function main(): void {
  const config = loadConfig();
  const pool = createPool(config.database.url, config.database.poolMax, config.database.statementTimeoutMs);
  const db = createDb(pool);

  const audit = createAuditRepository(db);
  const accounts = createAccountsRepository(db);
  const inventoryRepo = createInventoryRepository(db);
  const outbox = createOutbox(db);

  const billing = new BillingService(db, createBillingRepository(db), inventoryRepo, audit);
  const orders = new OrdersService(db, createOrdersRepository(db), inventoryRepo, accounts, audit);
  const inventory = new InventoryService(db, inventoryRepo, billing, orders, audit);
  const users = new UsersService(db, createUsersRepository(db), inventoryRepo, outboxInvitationSender(outbox), audit);
  const tickets = new TicketsService(db, createTicketsRepository(db), inventoryRepo, accounts, outboxTicketNotifier(outbox), audit);
  const sla = new SlaService(createSlaRepository(db), inventoryRepo, accounts);
  const payments = new PaymentMethodsService(
    db,
    createPaymentMethodsRepository(db),
    createHttpPaymentGateway(config.payments),
    inventoryRepo,
    audit
  );

  const app = createApp({
    config,
    verifier: createTokenVerifier(config.jwt),
    health: { ready: async () => void (await db.one('SELECT 1 AS ok')) },
    routers: [
      accountsRoutes(new AccountsService(db, accounts, audit)),
      inventoryRoutes(inventory),
      ordersRoutes(orders),
      billingRoutes(billing),
      paymentMethodsRoutes(payments),
      usersRoutes(users),
      ticketsRoutes(tickets),
      slaRoutes(sla),
      auditRoutes(new AuditService(audit))
    ]
  });

  const server = createServer(app);
  server.keepAliveTimeout = 65_000;
  server.listen(config.port, () => logger.info('gokinetic-business-api listening', { port: config.port, env: config.env }));

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    const force = setTimeout(() => {
      logger.error('forced shutdown after grace period');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
      pool
        .end()
        .then(() => process.exit(0))
        .catch((err) => {
          logger.error('error closing database pool', { err });
          process.exit(1);
        });
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('unhandled promise rejection', { err: reason }));
}

main();
