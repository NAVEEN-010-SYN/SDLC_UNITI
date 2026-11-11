'use strict';

const crypto = require('node:crypto');
const { ConflictError, ValidationError } = require('../errors');

const HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function fingerprint(req) {
  return crypto
    .createHash('sha256')
    .update(`${req.method}|${req.originalUrl}|${JSON.stringify(req.body || {})}`)
    .digest('hex');
}

/**
 * Makes unsafe POSTs (order placement, quote acceptance) safe to retry.
 *
 * The first request with a key records a `IN_PROGRESS` marker; when it
 * completes the response is stored and replayed for subsequent identical
 * requests. Reusing a key with a different body is a 409, and a concurrent
 * duplicate while the first is still running is also a 409.
 *
 * @param {object} store repository with `begin`, `complete`, `release`
 * @param {{ required?: boolean }} [options]
 */
function idempotency(store, { required = true } = {}) {
  return async (req, res, next) => {
    const key = req.get(HEADER);
    if (!key) {
      if (!required) return next();
      return next(new ValidationError([{ path: `headers.${HEADER}`, message: 'Is required.' }]));
    }
    if (!KEY_PATTERN.test(key)) {
      return next(new ValidationError([{ path: `headers.${HEADER}`, message: 'Must be 16-64 characters.' }]));
    }
    const scope = req.user ? req.user.id : `ip:${req.ip}`;
    const hash = fingerprint(req);

    try {
      const existing = await store.begin({ key, scope, requestHash: hash });
      if (existing) {
        if (existing.requestHash !== hash) {
          return next(new ConflictError('Idempotency-Key was reused with a different request body.'));
        }
        if (existing.state === 'IN_PROGRESS') {
          return next(new ConflictError('A request with this Idempotency-Key is still being processed.'));
        }
        res.set('Idempotent-Replayed', 'true');
        return res.status(existing.responseStatus).json(existing.responseBody);
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      const persist =
        status < 500
          ? store.complete({ key, scope, responseStatus: status, responseBody: body })
          : store.release({ key, scope });
      Promise.resolve(persist).catch(() => {});
      return originalJson(body);
    };
    res.on('finish', () => {
      if (res.statusCode >= 400 && res.statusCode !== 409) {
        Promise.resolve(store.release({ key, scope })).catch(() => {});
      }
    });
    return next();
  };
}

module.exports = { idempotency, IDEMPOTENCY_HEADER: HEADER, fingerprint };
