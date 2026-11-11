'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { correlationId, CORRELATION_HEADER } = require('./middleware/correlationId');
const { requestLogger } = require('./middleware/requestLogger');
const { rateLimit } = require('./middleware/rateLimit');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { IDEMPOTENCY_HEADER } = require('./middleware/idempotency');
const { CART_TOKEN_HEADER } = require('./controllers/cartController');
const { createApiRouter } = require('./routes');
const { createHealthRouter } = require('./routes/healthRoutes');

const API_PREFIX = '/api/v1';
const BODY_LIMIT = '100kb';

/**
 * Builds the Express application. No I/O happens here, so tests can create
 * an app around an in-memory container.
 *
 * @param {object} params
 * @param {object} params.container from createContainer()
 * @param {() => boolean} [params.isDatabaseReady]
 * @param {object} [params.scheduler]
 */
function createApp({ container, isDatabaseReady = () => true, scheduler }) {
  const { config } = container;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  // Correlation id first so every later log line (including errors) has it.
  app.use(correlationId());
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type', CORRELATION_HEADER, IDEMPOTENCY_HEADER, CART_TOKEN_HEADER],
      exposedHeaders: [
        CORRELATION_HEADER,
        CART_TOKEN_HEADER,
        'Location',
        'Retry-After',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Idempotent-Replayed',
      ],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT, type: ['application/json', 'application/*+json'] }));
  app.use(requestLogger({ ignorePaths: [`${API_PREFIX}/health`, `${API_PREFIX}/health/ready`] }));
  app.use(API_PREFIX, rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }));

  const healthRouter = createHealthRouter({ isDatabaseReady, scheduler });
  app.use(API_PREFIX, createApiRouter({ container, healthRouter }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, API_PREFIX };
