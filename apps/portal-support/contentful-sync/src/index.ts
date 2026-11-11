import { loadConfig } from './config';
import { ContentfulSyncClient } from './contentful/syncClient';
import { createLogger, withCorrelationId } from './logger';
import { HttpSearchIndexPublisher } from './publish/searchIndex';
import { createApp } from './server';
import { SyncService } from './sync/syncService';
import { FileTokenStore } from './sync/tokenStore';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const sync = new SyncService(
    new ContentfulSyncClient(config.contentful, logger),
    new HttpSearchIndexPublisher(config.searchIndex, logger),
    new FileTokenStore(config.syncStateFile),
    logger,
    config.contentful.defaultLocale,
  );

  const runScheduled = (): void => {
    withCorrelationId(undefined, () => {
      sync.trigger().catch((err: Error) => logger.error('sync.failed', { error: err.message, trigger: 'schedule' }));
    });
  };

  if (process.argv.includes('--once')) {
    await withCorrelationId(undefined, () => sync.trigger());
    return;
  }

  const server = createApp({ sync, webhook: config.webhook, logger }).listen(config.port, () => {
    logger.info('server.listening', { port: config.port });
  });
  runScheduled();
  const timer = setInterval(runScheduled, config.syncIntervalSeconds * 1000);

  const shutdown = (signal: string): void => {
    logger.info('server.shutdown', { signal });
    clearInterval(timer);
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: Error) => {
  process.stderr.write(JSON.stringify({ level: 'error', event: 'startup.failed', error: err.message }) + '\n');
  process.exit(1);
});
