'use strict';

/**
 * Minimal structured JSON logger.
 *
 * Every line is a single JSON object containing a timestamp, level, message and
 * (when available) the correlation id of the current request, so logs can be
 * joined across services in Kibana / Dynatrace.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const LEVELS = { error: 50, warn: 40, info: 30, debug: 20, trace: 10 };

const requestContext = new AsyncLocalStorage();

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cardtoken',
  'paymenttoken',
  'apikey',
]);

/**
 * Recursively replaces values of sensitive keys with a redaction marker.
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(inner, depth + 1);
  }
  return out;
}

function createLogger({ level = 'info', bindings = {}, sink = process.stdout } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(lvl, message, fields) {
    if (LEVELS[lvl] < threshold) return;
    const store = requestContext.getStore();
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: message,
      service: 'ecom-gokinetic-api',
      ...bindings,
      ...(store && store.correlationId ? { correlationId: store.correlationId } : {}),
      ...(fields ? redact(fields) : {}),
    };
    sink.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    error: (msg, fields) => write('error', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    debug: (msg, fields) => write('debug', msg, fields),
    trace: (msg, fields) => write('trace', msg, fields),
    child: (extra) => createLogger({ level, bindings: { ...bindings, ...extra }, sink }),
  };
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info'),
});

/** Returns the correlation id bound to the current async context, if any. */
function currentCorrelationId() {
  const store = requestContext.getStore();
  return store ? store.correlationId : undefined;
}

module.exports = { logger, createLogger, requestContext, currentCorrelationId, redact };
