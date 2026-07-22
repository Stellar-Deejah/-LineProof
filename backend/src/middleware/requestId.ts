/**
 * Attaches a correlation ID to every request so a request log entry and any
 * error it produces can be tied together (issue #30). Honours an incoming
 * `X-Request-Id` header (e.g. from a load balancer or upstream service) so a
 * trace ID can be propagated across service boundaries instead of being
 * regenerated at each hop.
 */
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.trim().length > 0 ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
