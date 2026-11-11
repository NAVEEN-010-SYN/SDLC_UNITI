'use strict';

/**
 * Tiny composable schema validator.
 *
 * Each rule is a function `(value, path) => { value, errors }` that returns the
 * coerced value plus field errors in the shared `{ path, message }` format.
 * Kept in-house so validation errors map 1:1 onto problem+json `errors`.
 */

const ok = (value) => ({ value, errors: [] });
const fail = (path, message) => ({ value: undefined, errors: [{ path, message }] });

const isMissing = (value) => value === undefined || value === null;

/**
 * Wraps a raw rule so missing values report "Is required." and attaches the
 * chainable `.optional()`, `.default()` and `.refine()` modifiers.
 */
function withModifiers(rawRule, { allowMissing = false } = {}) {
  const rule = allowMissing
    ? rawRule
    : (value, path) => (isMissing(value) ? fail(path, 'Is required.') : rawRule(value, path));
  rule.optional = () =>
    withModifiers((value, path) => (isMissing(value) ? ok(undefined) : rawRule(value, path)), {
      allowMissing: true,
    });
  rule.default = (fallback) =>
    withModifiers((value, path) => (isMissing(value) ? ok(fallback) : rawRule(value, path)), {
      allowMissing: true,
    });
  rule.refine = (predicate, message) =>
    withModifiers(
      (value, path) => {
        const result = rawRule(value, path);
        if (result.errors.length || result.value === undefined) return result;
        return predicate(result.value) ? result : fail(path, message);
      },
      { allowMissing },
    );
  return rule;
}

function string({ min = 0, max = 10000, pattern, trim = true, lowercase = false, uppercase = false } = {}) {
  return withModifiers((value, path) => {
    if (typeof value !== 'string') return fail(path, 'Must be a string.');
    let v = trim ? value.trim() : value;
    if (lowercase) v = v.toLowerCase();
    if (uppercase) v = v.toUpperCase();
    if (v.length < min) return fail(path, min === 1 ? 'Is required.' : `Must be at least ${min} characters.`);
    if (v.length > max) return fail(path, `Must be at most ${max} characters.`);
    if (pattern && !pattern.test(v)) return fail(path, 'Has an invalid format.');
    return ok(v);
  });
}

function email() {
  return string({ max: 254, lowercase: true }).refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    'Must be a valid email address.',
  );
}

function integer({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, coerce = false } = {}) {
  return withModifiers((value, path) => {
    let v = value;
    if (coerce && typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number.parseInt(v, 10);
    if (!Number.isSafeInteger(v)) return fail(path, 'Must be an integer.');
    if (v < min) return fail(path, `Must be at least ${min}.`);
    if (v > max) return fail(path, `Must be at most ${max}.`);
    return ok(v);
  });
}

function boolean({ coerce = false } = {}) {
  return withModifiers((value, path) => {
    if (typeof value === 'boolean') return ok(value);
    if (coerce && (value === 'true' || value === 'false')) return ok(value === 'true');
    return fail(path, 'Must be a boolean.');
  });
}

function oneOf(values) {
  return withModifiers((value, path) =>
    values.includes(value) ? ok(value) : fail(path, `Must be one of: ${values.join(', ')}.`),
  );
}

function isoDate() {
  return withModifiers((value, path) => {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      return fail(path, 'Must be an ISO-8601 date-time.');
    }
    return ok(new Date(value));
  });
}

function array(itemRule, { min = 0, max = 1000 } = {}) {
  return withModifiers((value, path) => {
    if (!Array.isArray(value)) return fail(path, 'Must be an array.');
    if (value.length < min) return fail(path, `Must contain at least ${min} item(s).`);
    if (value.length > max) return fail(path, `Must contain at most ${max} item(s).`);
    const out = [];
    const errors = [];
    value.forEach((item, i) => {
      const r = itemRule(item, `${path}[${i}]`);
      errors.push(...r.errors);
      out.push(r.value);
    });
    return { value: out, errors };
  });
}

/**
 * @param {Record<string, Function>} shape
 * @param {{ allowUnknown?: boolean }} [options] unknown keys are rejected by default
 */
function object(shape, { allowUnknown = false } = {}) {
  return withModifiers((value, path) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(path || 'body', 'Must be an object.');
    }
    const out = {};
    const errors = [];
    for (const [key, rule] of Object.entries(shape)) {
      const childPath = path ? `${path}.${key}` : key;
      const r = rule(value[key], childPath);
      errors.push(...r.errors);
      if (r.value !== undefined) out[key] = r.value;
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) {
        if (allowUnknown) out[key] = value[key];
        else errors.push({ path: path ? `${path}.${key}` : key, message: 'Is not an allowed field.' });
      }
    }
    return { value: out, errors };
  });
}

/** Accepts anything (used for opaque metadata maps). */
function any() {
  return withModifiers((value) => ok(value));
}

/**
 * Runs a schema and returns `{ value, errors }`. Missing required fields are
 * reported because rules are invoked with `undefined`.
 */
function validate(schema, input) {
  return schema(input, '');
}

module.exports = { string, email, integer, boolean, oneOf, isoDate, array, object, any, validate };
