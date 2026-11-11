import { createApp } from './app';
import { loadConfig } from './config/env';
import { createContainer, parseTenantDirectory } from './container';
import { Scheduler } from './jobs/Scheduler';
import { evaluateAlerts, executeDueChanges, pollMetrics } from './jobs/tasks';
import { createLogger } from './logging/logger';

function main(): void {
  const cfg = loadConfig();
  const logger = createLogger(cfg.LOG_LEVEL);
  const configuredTenants = parseTenantDirectory(process.env.SDWAN_TENANTS);
  const c = createContainer(cfg, logger, { tenants: configuredTenants.length ? configuredTenants : undefined });
  if (cfg.SDWAN_PROVIDER_MODE === 'live' && c.repos.tenants.accounts().length === 0) {
    logger.warn('no SDWAN_TENANTS configured; every account will see an empty inventory');
  }

  const scheduler = new Scheduler(logger.child({ component: 'scheduler' }));
  const deps = { tenants: c.repos.tenants, inventory: c.inventory, metrics: c.repos.metrics, alerts: c.alerts, changes: c.changes, logger };
  scheduler.register('metrics-poll', cfg.METRICS_POLL_INTERVAL_SEC * 1000, () => pollMetrics(deps));
  scheduler.register('alert-eval', cfg.ALERT_EVAL_INTERVAL_SEC * 1000, () => evaluateAlerts(deps));
  scheduler.register('change-executor', cfg.CHANGE_EXECUTOR_INTERVAL_SEC * 1000, () => executeDueChanges(deps));

  const app = createApp(c, {
    corsOrigins: cfg.CORS_ORIGINS.split(',').map((o) => o.trim()),
    jobStatus: () => scheduler.status(),
  });
  const server = app.listen(cfg.PORT, () => {
    logger.info('sdwan-portal-api listening', { port: cfg.PORT, providerMode: cfg.SDWAN_PROVIDER_MODE });
    scheduler.start();
    void scheduler.runNow('metrics-poll').then(() => scheduler.runNow('alert-eval'));
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    scheduler.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
