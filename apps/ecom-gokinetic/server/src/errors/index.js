'use strict';

/**
 * Application error hierarchy. Each error maps to an RFC 7807 problem type so
 * the error handler can render `application/problem+json` without guessing.
 */

const PROBLEM_BASE = 'https://errors.gokinetic.example/problems';

class AppError extends Error {
  /**
   * @param {object} params
   * @param {number} params.status HTTP status code
   * @param {string} params.type   short problem slug, e.g. "validation-error"
   * @param {string} params.title  human readable, stable summary
   * @param {string} [params.detail] occurrence specific explanation
   * @param {object} [params.extensions] extra problem members (e.g. `errors`)
   */
  constructor({ status, type, title, detail, extensions }) {
    super(detail || title);
    this.name = this.constructor.name;
    this.status = status;
    this.type = `${PROBLEM_BASE}/${type}`;
    this.title = title;
    this.detail = detail;
    this.extensions = extensions || {};
    this.expose = true;
  }
}

class ValidationError extends AppError {
  /** @param {Array<{path: string, message: string}>} errors */
  constructor(errors, detail = 'One or more fields are invalid.') {
    super({
      status: 400,
      type: 'validation-error',
      title: 'Request validation failed',
      detail,
      extensions: { errors },
    });
  }
}

class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication is required to access this resource.') {
    super({ status: 401, type: 'unauthorized', title: 'Unauthorized', detail });
  }
}

class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to perform this action.') {
    super({ status: 403, type: 'forbidden', title: 'Forbidden', detail });
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super({
      status: 404,
      type: 'not-found',
      title: 'Resource not found',
      detail: id ? `${resource} '${id}' was not found.` : `${resource} was not found.`,
      extensions: { resource },
    });
  }
}

class ConflictError extends AppError {
  constructor(detail, extensions) {
    super({ status: 409, type: 'conflict', title: 'Conflict', detail, extensions });
  }
}

class BusinessRuleError extends AppError {
  /**
   * A request that is well-formed but violates a domain rule
   * (e.g. promo expired, address not serviceable).
   * @param {string} code machine-readable rule code
   * @param {string} detail
   * @param {object} [extensions]
   */
  constructor(code, detail, extensions = {}) {
    super({
      status: 422,
      type: 'business-rule-violation',
      title: 'Business rule violated',
      detail,
      extensions: { code, ...extensions },
    });
    this.code = code;
  }
}

class InvalidStateTransitionError extends AppError {
  constructor(entity, from, to) {
    super({
      status: 409,
      type: 'invalid-state-transition',
      title: 'Invalid state transition',
      detail: `${entity} cannot move from ${from} to ${to}.`,
      extensions: { entity, from, to },
    });
  }
}

class PaymentDeclinedError extends AppError {
  constructor(reason, extensions = {}) {
    super({
      status: 402,
      type: 'payment-declined',
      title: 'Payment declined',
      detail: reason || 'The payment method was declined.',
      extensions,
    });
  }
}

class RateLimitError extends AppError {
  constructor(retryAfterSeconds) {
    super({
      status: 429,
      type: 'rate-limited',
      title: 'Too many requests',
      detail: `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      extensions: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class UpstreamError extends AppError {
  /**
   * @param {string} dependency name of the failing upstream (e.g. "payment-gateway")
   * @param {string} detail
   * @param {number} [upstreamStatus]
   */
  constructor(dependency, detail, upstreamStatus) {
    super({
      status: 502,
      type: 'upstream-failure',
      title: 'Upstream dependency failed',
      detail,
      extensions: { dependency, ...(upstreamStatus ? { upstreamStatus } : {}) },
    });
    this.dependency = dependency;
    this.upstreamStatus = upstreamStatus;
  }
}

module.exports = {
  PROBLEM_BASE,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  InvalidStateTransitionError,
  PaymentDeclinedError,
  RateLimitError,
  UpstreamError,
};
