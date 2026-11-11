'use strict';

const { ValidationError } = require('../errors');

/**
 * For idempotent PUT-by-key routes (`PUT /products/:sku`): the key in the
 * body must equal the key in the URL, so a client cannot address one
 * resource while writing another. Runs after both are validated.
 * @param {string} field name shared by params and body
 */
function paramMatchesBody(field) {
  return (req, _res, next) => {
    if (req.body[field] !== req.params[field]) {
      return next(new ValidationError([{ path: field, message: `Must match the ${field} in the URL.` }]));
    }
    return next();
  };
}

module.exports = { paramMatchesBody };
