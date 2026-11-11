'use strict';

const { logger } = require('../config/logger');

function levelFor(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * Logs one structured line per request on completion with latency, status and
 * the authenticated principal (never the token itself).
 */
function requestLogger({ log = logger, ignorePaths = ['/api/v1/health'] } = {}) {
  return (req, res, next) => {
    if (ignorePaths.includes(req.path)) return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const level = levelFor(res.statusCode);
      log[level]('http.request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.user ? req.user.id : undefined,
        accountId: req.user ? req.user.accountId : undefined,
        ip: req.ip,
      });
    });
    return next();
  };
}

module.exports = { requestLogger };
