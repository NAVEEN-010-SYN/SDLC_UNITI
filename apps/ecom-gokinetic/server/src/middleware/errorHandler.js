'use strict';

const { AppError, NotFoundError, PROBLEM_BASE } = require('../errors');
const { logger } = require('../config/logger');

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * Translates library errors (Mongoose, body-parser, JWT) into AppErrors so
 * they render consistently.
 */
function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err && err.type === 'entity.parse.failed') {
    return new AppError({
      status: 400,
      type: 'malformed-json',
      title: 'Malformed JSON body',
      detail: 'The request body could not be parsed as JSON.',
    });
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError({ status: 413, type: 'payload-too-large', title: 'Payload too large' });
  }
  if (err && err.name === 'CastError') {
    return new AppError({
      status: 400,
      type: 'invalid-identifier',
      title: 'Invalid identifier',
      detail: `Value for ${err.path} is not a valid identifier.`,
    });
  }
  if (err && err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return new AppError({
      status: 400,
      type: 'validation-error',
      title: 'Request validation failed',
      detail: 'One or more fields are invalid.',
      extensions: { errors },
    });
  }
  if (err && (err.code === 11000 || err.code === 11001)) {
    return new AppError({
      status: 409,
      type: 'conflict',
      title: 'Conflict',
      detail: 'A resource with the same unique key already exists.',
      extensions: { keys: Object.keys(err.keyValue || {}) },
    });
  }
  const internal = new AppError({
    status: 500,
    type: 'internal-error',
    title: 'Internal server error',
    detail: 'An unexpected error occurred. Quote the correlation id when contacting support.',
  });
  internal.expose = false;
  internal.cause = err;
  return internal;
}

/** Builds the RFC 7807 body for an AppError. */
function toProblem(appError, req) {
  return {
    type: appError.type,
    title: appError.title,
    status: appError.status,
    ...(appError.detail ? { detail: appError.detail } : {}),
    instance: req.originalUrl,
    correlationId: req.correlationId,
    ...appError.extensions,
  };
}

/** 404 for unmatched routes. */
function notFoundHandler(req, _res, next) {
  next(new NotFoundError('Route', `${req.method} ${req.path}`));
}

/** Final Express error middleware. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const appError = normalizeError(err);
  if (appError.status >= 500) {
    logger.error('http.unhandled_error', {
      path: req.originalUrl,
      method: req.method,
      error: appError.cause || err,
    });
  }
  if (res.headersSent) return res.end();
  return res.status(appError.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(toProblem(appError, req)));
}

module.exports = { errorHandler, notFoundHandler, normalizeError, toProblem, PROBLEM_CONTENT_TYPE, PROBLEM_BASE };
