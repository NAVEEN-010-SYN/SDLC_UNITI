import { Router } from 'express';
import { AuthConfig } from '../config';
import { ConversationService } from '../conversation/conversationService';
import { ValidationError } from '../domain/errors';
import { Channel, TranscriptEntry } from '../domain/types';
import { RateLimiter } from '../ratelimit/rateLimiter';
import { asyncHandler, authenticate, ChatRequest, rateLimit, requireRole } from './middleware';

/**
 * REST API (versioned under /api/v1):
 *   POST   /conversations                       start a conversation
 *   GET    /conversations                       list the caller's active conversations
 *   GET    /conversations/:id                   conversation status
 *   POST   /conversations/:id/messages          send a user message, returns bot replies
 *   GET    /conversations/:id/transcript        paginated redacted transcript
 *   DELETE /conversations/:id                   end the conversation
 *   POST   /conversations/:id/agent-messages    live agent reply (SUPPORT_AGENT)
 */

const MAX_PAGE_SIZE = 100;

export function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const errors: Array<{ field: string; message: string }> = [];
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', message: 'must be an integer >= 1' });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    errors.push({ field: 'pageSize', message: `must be an integer between 1 and ${MAX_PAGE_SIZE}` });
  }
  if (errors.length > 0) throw new ValidationError(errors);
  return { page, pageSize };
}

function parseChannel(body: unknown): Channel {
  const channel = (body as { channel?: unknown } | undefined)?.channel;
  if (channel === undefined) return 'REST';
  if (channel === 'REST' || channel === 'WEB_WIDGET') return channel;
  throw new ValidationError([{ field: 'channel', message: 'must be REST or WEB_WIDGET' }]);
}

function idParam(req: ChatRequest): string {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError([{ field: 'id', message: 'must be a UUID' }]);
  return id;
}

export function conversationRoutes(
  service: ConversationService,
  auth: AuthConfig,
  limiter: RateLimiter,
  onAgentMessage: (entry: TranscriptEntry) => void = () => undefined,
): Router {
  const router = Router();
  router.use(authenticate(auth));

  router.post(
    '/conversations',
    rateLimit(limiter),
    asyncHandler(async (req, res) => {
      const result = await service.start(req.principal!, parseChannel(req.body));
      res.status(201).location(`/api/v1/conversations/${result.conversation.id}`).json(result);
    }),
  );

  router.get(
    '/conversations',
    asyncHandler(async (req, res) => {
      const items = await service.listForUser(req.principal!);
      res.json({ items, page: 1, pageSize: items.length, total: items.length });
    }),
  );

  router.get(
    '/conversations/:id',
    asyncHandler(async (req, res) => {
      res.json(await service.get(idParam(req), req.principal!));
    }),
  );

  router.post(
    '/conversations/:id/messages',
    rateLimit(limiter),
    asyncHandler(async (req, res) => {
      const text = (req.body as { text?: unknown } | undefined)?.text;
      const result = await service.handleMessage(idParam(req), req.principal!, text as string, {
        correlationId: req.correlationId,
        bearerToken: req.bearerToken,
      });
      res.json(result);
    }),
  );

  router.get(
    '/conversations/:id/transcript',
    asyncHandler(async (req, res) => {
      const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
      res.json(await service.transcript(idParam(req), req.principal!, page, pageSize));
    }),
  );

  router.delete(
    '/conversations/:id',
    asyncHandler(async (req, res) => {
      res.json(await service.end(idParam(req), req.principal!));
    }),
  );

  router.post(
    '/conversations/:id/agent-messages',
    requireRole('SUPPORT_AGENT'),
    asyncHandler(async (req, res) => {
      const text = (req.body as { text?: unknown } | undefined)?.text;
      const entry = await service.agentMessage(idParam(req), req.principal!, text as string);
      onAgentMessage(entry);
      res.status(201).json(entry);
    }),
  );

  return router;
}

export interface HealthCheck {
  name: string;
  check(): Promise<boolean>;
}

export function healthRoutes(checks: HealthCheck[]): Router {
  const router = Router();
  router.get('/health/live', (_req, res) => {
    res.json({ status: 'UP' });
  });
  router.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      const results = await Promise.all(
        checks.map(async (c) => ({ name: c.name, up: await c.check().catch(() => false) })),
      );
      const up = results.every((r) => r.up);
      res.status(up ? 200 : 503).json({ status: up ? 'UP' : 'DOWN', checks: results });
    }),
  );
  return router;
}
