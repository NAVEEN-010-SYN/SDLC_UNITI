import express, { Express, Router } from 'express';
import helmet from 'helmet';
import { AppConfig } from './config/env';
import { TokenVerifier } from './auth/jwt';
import { authenticate } from './middleware/auth';
import { correlationId } from './middleware/correlationId';
import { cors } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { asyncHandler } from './lib/asyncHandler';

export interface HealthCheck {
  /** Resolves when downstream dependencies (database) are reachable. */
  ready(): Promise<void>;
}

export interface AppDependencies {
  config: Pick<AppConfig, 'corsAllowedOrigins' | 'env'>;
  verifier: TokenVerifier;
  health: HealthCheck;
  /** Feature routers mounted under /api/v1 behind authentication. */
  routers: Router[];
}

export const API_PREFIX = '/api/v1';

/** Builds the Express app. Kept free of I/O so it can be exercised with supertest. */
export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(correlationId());
  app.use(requestLogger());
  app.use(helmet());
  app.use(cors(deps.config.corsAllowedOrigins));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      try {
        await deps.health.ready();
        res.json({ status: 'ok' });
      } catch {
        res.status(503).json({ status: 'unavailable' });
      }
    })
  );

  const api = Router();
  api.use(authenticate(deps.verifier));
  api.use((_req, res, next) => {
    // Customer data must never be cached by shared proxies.
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });
  for (const router of deps.routers) api.use(router);
  app.use(API_PREFIX, api);

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}
