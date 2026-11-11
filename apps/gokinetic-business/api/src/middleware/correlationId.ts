import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../lib/logger';

export const CORRELATION_HEADER = 'X-Correlation-Id';
const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Accepts an inbound X-Correlation-Id (if well-formed) or generates one, echoes it on the
 * response and binds it to the async context so every log line carries it.
 */
export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const inbound = req.header(CORRELATION_HEADER);
    const id = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    requestContext.run({ correlationId: id }, () => next());
  };
}
