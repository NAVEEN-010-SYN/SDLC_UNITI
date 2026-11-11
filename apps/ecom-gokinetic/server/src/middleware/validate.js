'use strict';

const { validate } = require('../validation/validator');
const { ValidationError } = require('../errors');

/**
 * Validates `req[source]` against a schema and replaces it with the coerced
 * value. Query/param errors are prefixed so clients know where to look.
 *
 * @param {Function} schema built with validation/validator
 * @param {'body'|'query'|'params'} [source='body']
 */
function validateRequest(schema, source = 'body') {
  return (req, _res, next) => {
    const input = req[source] === undefined ? {} : req[source];
    const { value, errors } = validate(schema, input);
    if (errors.length > 0) {
      const prefixed =
        source === 'body'
          ? errors
          : errors.map((e) => ({ ...e, path: `${source}.${e.path}` }));
      return next(new ValidationError(prefixed));
    }
    if (source === 'query') {
      // Express 5 makes req.query a getter; store validated values separately.
      req.validatedQuery = value;
    } else {
      req[source] = value;
    }
    return next();
  };
}

module.exports = { validateRequest };
