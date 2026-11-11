'use strict';

const { requestContext } = require('../config/logger');
const { generateCorrelationId } = require('../domain/identifiers');

const HEADER = 'X-Correlation-Id';
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Accepts an inbound `X-Correlation-Id` (if well-formed) or generates one,
 * echoes it on the response and binds it to the async context so the logger
 * and outbound HTTP clients pick it up automatically.
 */
function correlationId() {
  return (req, res, next) => {
    const inbound = req.get(HEADER);
    const id = inbound && VALID_ID.test(inbound) ? inbound : generateCorrelationId();
    req.correlationId = id;
    res.set(HEADER, id);
    requestContext.run({ correlationId: id }, () => next());
  };
}

module.exports = { correlationId, CORRELATION_HEADER: HEADER };
