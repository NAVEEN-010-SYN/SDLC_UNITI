import express, { NextFunction, Request, Response } from 'express';
import { Config } from './config';
import { currentCorrelationId, Logger, withCorrelationId } from './logger';
import { SyncService } from './sync/syncService';
import { verifyWebhook } from './webhooks/signature';

const CORRELATION_HEADER = 'x-correlation-id';
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Topics that change published content; anything else is acknowledged and ignored. */
const RELEVANT_TOPICS = /^ContentManagement\.Entry\.(publish|unpublish|delete|archive)$/;

function problem(res: Response, status: number, title: string, detail: string): void {
  res.status(status).type('application/problem+json').json({
    type: `https://errors.uniti.example/contentful-sync/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance: res.req.originalUrl,
    correlationId: res.getHeader('X-Correlation-Id'),
  });
}

export function createApp(deps: { sync: SyncService; webhook: Config['webhook']; logger: Logger }): express.Express {
  const { sync, webhook, logger } = deps;
  const app = express();
  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.header(CORRELATION_HEADER);
    const id = incoming && CORRELATION_PATTERN.test(incoming) ? incoming : undefined;
    withCorrelationId(id, () => {
      res.setHeader('X-Correlation-Id', currentCorrelationId());
      next();
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'UP', time: new Date().toISOString() });
  });

  app.post(
    '/webhooks/contentful',
    express.raw({ type: '*/*', limit: '1mb' }),
    (req: Request, res: Response) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const verdict = verifyWebhook(
        { method: req.method, path: req.originalUrl, headers: req.headers, rawBody },
        webhook.secret,
        webhook.maxAgeSeconds,
      );
      if (!verdict.ok) {
        logger.warn('webhook.rejected', { reason: verdict.reason });
        problem(res, 401, 'Unauthorized', 'Webhook signature verification failed.');
        return;
      }

      const topic = req.header('x-contentful-topic') ?? '';
      if (!RELEVANT_TOPICS.test(topic)) {
        res.status(204).end();
        return;
      }

      logger.info('webhook.accepted', { topic });
      sync.trigger().catch((err: Error) => logger.error('sync.failed', { error: err.message, trigger: 'webhook' }));
      res.status(202).json({ accepted: true });
    },
  );

  app.use((_req: Request, res: Response) => problem(res, 404, 'Not Found', 'No such route.'));

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      problem(res, 413, 'Payload Too Large', 'Webhook body exceeds 1 MB.');
      return;
    }
    logger.error('http.unhandled', { error: err.message });
    problem(res, 500, 'Internal Server Error', 'Unexpected error. Quote the correlation id when reporting.');
  });

  return app;
}
