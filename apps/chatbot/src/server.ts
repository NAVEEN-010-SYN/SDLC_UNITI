import { createServer } from 'http';
import { createApplication } from './app';
import { loadConfig } from './config';
import { HandoffPublisher } from './conversation/conversationService';
import { WebSocketGateway } from './gateway/websocketGateway';
import { createLogger } from './logger';

/** Process entry point: HTTP + WebSocket on one port, with graceful shutdown. */

const TRANSCRIPT_RETENTION_DAYS = 90;
const HOUSEKEEPING_INTERVAL_MS = 15 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel, { env: config.env });

  // The gateway is created first so it can act as the handoff publisher and
  // receive live-agent messages from the REST endpoint.
  let gateway: WebSocketGateway | undefined;
  const handoff: HandoffPublisher = {
    publish: async (conversation, transcript) => gateway?.publish(conversation, transcript),
  };

  const application = createApplication(config, logger, {
    handoff,
    onAgentMessage: (entry) => {
      gateway?.deliverAgentMessage(entry);
    },
  });

  gateway = new WebSocketGateway({
    allowedOrigins: config.widgetAllowedOrigins,
    logger,
    sessionDeps: { service: application.service, auth: config.auth, limiter: application.limiter, logger },
  });

  const server = createServer(application.app);
  gateway.attach(server);

  const housekeeping = setInterval(async () => {
    try {
      const expired = await application.repository.purgeExpired();
      const swept = application.limiter.sweep();
      const cutoff = new Date(Date.now() - TRANSCRIPT_RETENTION_DAYS * 86_400_000).toISOString();
      const purged = await application.transcripts.purgeOlderThan(cutoff);
      logger.info('housekeeping', { expiredConversations: expired, rateLimitKeysSwept: swept, transcriptEntriesPurged: purged });
    } catch (error) {
      logger.error('housekeeping failed', { error });
    }
  }, HOUSEKEEPING_INTERVAL_MS);
  housekeeping.unref();

  server.listen(config.port, () => logger.info('chatbot listening', { port: config.port }));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    clearInterval(housekeeping);
    await gateway?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await application.analytics.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ level: 'error', message: 'startup failed', error: String(error) })}\n`);
  process.exit(1);
});
