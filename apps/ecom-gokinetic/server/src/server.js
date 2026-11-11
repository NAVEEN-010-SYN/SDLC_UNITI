'use strict';

const config = require('./config');
const { logger } = require('./config/logger');
const { connectDatabase, disconnectDatabase, isDatabaseReady } = require('./config/db');
const { createContainer } = require('./container');
const { createApp } = require('./app');
const { buildScheduler } = require('./jobs');

const SHUTDOWN_GRACE_MS = 15000;

/**
 * Process entry point: connect to MongoDB, start HTTP and background jobs,
 * and shut down gracefully on SIGTERM/SIGINT (Kubernetes rolling deploys).
 */
async function main() {
  await connectDatabase(config.mongo.uri);

  const container = createContainer(config);
  const scheduler = buildScheduler(container);
  const app = createApp({ container, isDatabaseReady, scheduler });

  const server = app.listen(config.port, () => {
    logger.info('http.listening', { port: config.port, env: config.nodeEnv });
  });
  // Keep-alive must outlive the load balancer's idle timeout to avoid 502s.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  if (config.jobs.enabled) scheduler.start();

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('process.shutdown', { signal });
    scheduler.stop();
    const forced = setTimeout(() => {
      logger.error('process.shutdown_forced', { afterMs: SHUTDOWN_GRACE_MS });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forced.unref();
    server.close(async () => {
      try {
        await disconnectDatabase();
      } finally {
        clearTimeout(forced);
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { error: reason instanceof Error ? reason : String(reason) });
  });
}

main().catch((err) => {
  logger.error('process.startup_failed', { error: err });
  process.exit(1);
});
