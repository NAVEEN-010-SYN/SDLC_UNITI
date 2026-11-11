import express, { Express } from 'express';
import { AnalyticsSink, BatchingAnalytics, httpTransport, logTransport } from './analytics/analyticsEmitter';
import { HttpClient } from './clients/httpClient';
import { HttpAccountClient, HttpBillingClient, HttpNetworkClient, HttpTicketClient, PlatformClients } from './clients/platformClients';
import { AppConfig } from './config';
import { ConversationService, HandoffPublisher } from './conversation/conversationService';
import { DialogEngine } from './dialog/dialogEngine';
import { defaultFlowRegistry } from './dialog/flows';
import { TranscriptEntry } from './domain/types';
import { correlationId, notFoundHandler, problemHandler, requestLogger } from './http/middleware';
import { conversationRoutes, HealthCheck, healthRoutes } from './http/routes';
import { Logger } from './logger';
import { CompositeIntentClassifier, IntentClassifier } from './nlu/intentClassifier';
import { HttpLlmProvider, LlmIntentProvider, NullLlmProvider } from './nlu/llmProvider';
import { RulesMatcher } from './nlu/rulesMatcher';
import { SlidingWindowRateLimiter } from './ratelimit/rateLimiter';
import { ConversationRepository, InMemoryConversationRepository } from './session/conversationRepository';
import { InMemoryTranscriptRepository, TranscriptRepository } from './transcripts/transcriptRepository';

/**
 * Composition root. Builds the object graph from configuration; every
 * dependency can be overridden (tests inject fakes for clients/clock).
 */

export interface AppOverrides {
  clients?: PlatformClients;
  llm?: LlmIntentProvider;
  classifier?: IntentClassifier;
  repository?: ConversationRepository;
  transcripts?: TranscriptRepository;
  analytics?: AnalyticsSink;
  handoff?: HandoffPublisher;
  clock?: () => Date;
  onAgentMessage?: (entry: TranscriptEntry) => void;
}

export interface Application {
  app: Express;
  service: ConversationService;
  limiter: SlidingWindowRateLimiter;
  analytics: AnalyticsSink;
  repository: ConversationRepository;
  transcripts: TranscriptRepository;
}

export function buildClients(config: AppConfig, logger: Logger): PlatformClients {
  const make = (serviceName: string, baseUrl: string) =>
    new HttpClient({ serviceName, baseUrl, timeoutMs: config.downstream.timeoutMs, retries: config.downstream.retries, logger });
  return {
    account: new HttpAccountClient(make('account-api', config.downstream.accountBaseUrl)),
    billing: new HttpBillingClient(make('billing-api', config.downstream.billingBaseUrl)),
    tickets: new HttpTicketClient(make('ticket-api', config.downstream.ticketBaseUrl)),
    network: new HttpNetworkClient(make('network-api', config.downstream.networkBaseUrl)),
  };
}

export function buildLlm(config: AppConfig, logger: Logger): LlmIntentProvider {
  if (config.llm.provider === 'http' && config.llm.endpoint) {
    return new HttpLlmProvider({
      endpoint: config.llm.endpoint,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      timeoutMs: config.llm.timeoutMs,
      logger,
    });
  }
  return new NullLlmProvider();
}

const loggingHandoff = (logger: Logger): HandoffPublisher => ({
  async publish(conversation) {
    logger.info('handoff requested', { conversationId: conversation.id, queue: conversation.handoff?.queue });
  },
});

export function createApplication(config: AppConfig, logger: Logger, overrides: AppOverrides = {}): Application {
  const clients = overrides.clients ?? buildClients(config, logger);
  const classifier =
    overrides.classifier ??
    new CompositeIntentClassifier({
      rules: new RulesMatcher(),
      llm: overrides.llm ?? buildLlm(config, logger),
      minConfidence: config.nluMinConfidence,
      logger,
    });
  const repository = overrides.repository ?? new InMemoryConversationRepository(config.sessionTtlSeconds);
  const transcripts = overrides.transcripts ?? new InMemoryTranscriptRepository();
  const analytics =
    overrides.analytics ??
    new BatchingAnalytics({
      transport: config.analytics.endpoint ? httpTransport(config.analytics.endpoint) : logTransport(logger),
      batchSize: config.analytics.batchSize,
      flushIntervalMs: config.analytics.flushIntervalMs,
      logger,
    });
  const engine = new DialogEngine({ flows: defaultFlowRegistry(overrides.clock), clients, logger, clock: overrides.clock });
  const service = new ConversationService({
    repository,
    transcripts,
    classifier,
    engine,
    analytics,
    handoff: overrides.handoff ?? loggingHandoff(logger),
    logger,
    clock: overrides.clock,
  });
  const limiter = new SlidingWindowRateLimiter(config.rateLimit.windowMs, config.rateLimit.maxMessages);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(correlationId());
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '16kb' }));

  const checks: HealthCheck[] = [{ name: 'conversation-store', check: async () => (await repository.purgeExpired()) >= 0 }];
  app.use('/api/v1', healthRoutes(checks));
  app.use('/api/v1', conversationRoutes(service, config.auth, limiter, overrides.onAgentMessage));
  app.use(notFoundHandler());
  app.use(problemHandler(logger));

  return { app, service, limiter, analytics, repository, transcripts };
}
