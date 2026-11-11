import express, { Express, RequestHandler, Router } from 'express';
import helmet from 'helmet';
import { authenticate } from './auth/jwt';
import { principalOf, requireAccountAccess } from './auth/rbac';
import type { Container } from './container';
import { notFoundHandler, problemHandler } from './errors/problem';
import { accessLog, cors, correlationId } from './http/middleware';
import type { JobStatus } from './jobs/Scheduler';
import { changeRoutes } from './routes/changeRoutes';
import { configRoutes } from './routes/configRoutes';
import { inventoryRoutes } from './routes/inventoryRoutes';
import { operationsRoutes } from './routes/operationsRoutes';
import { accountIdParam } from './validation/schemas';
import { parse } from './validation/validate';

export interface AppOptions {
  corsOrigins?: string[];
  jobStatus?: () => JobStatus[];
}

const validateAccountId: RequestHandler = (req, _res, next) => {
  try {
    parse(accountIdParam, req.params.accountId);
    next();
  } catch (err) {
    next(err);
  }
};

export function createApp(c: Container, opts: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(correlationId);
  app.use(helmet());
  app.use(cors(opts.corsOrigins ?? []));
  app.use(accessLog(c.logger));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req, res) => {
    const vendors = await c.providers.health().catch(() => ({}) as Record<string, boolean>);
    const ok = Object.values(vendors).length > 0 && Object.values(vendors).every(Boolean);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'degraded', vendors, jobs: opts.jobStatus?.() ?? [] });
  });

  const v1 = Router();
  v1.use(authenticate(c.jwt));

  v1.get('/me', (_req, res) => {
    const p = principalOf(res.locals);
    res.json({ userId: p.userId, roles: p.roles, accountId: p.accountId ?? null, partnerAccountIds: p.partnerAccountIds ?? [] });
  });

  const account = Router({ mergeParams: true });
  account.use(validateAccountId, requireAccountAccess);
  account.use('/', inventoryRoutes(c));
  account.use('/', configRoutes(c));
  account.use('/', operationsRoutes(c));
  account.use('/change-requests', changeRoutes(c));
  v1.use('/accounts/:accountId', account);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(problemHandler(c.logger));
  return app;
}
