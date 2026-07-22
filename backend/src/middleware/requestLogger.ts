/**
 * Structured request logger middleware.
 * In production replace with a proper logging library such as pino or winston.
 *
 * Also records Prometheus HTTP metrics on completion (issue #31):
 * `http_requests_total` and `http_request_duration_seconds`, labelled by
 * method, normalized route, and status code.
 */
import type { Request, Response, NextFunction } from 'express';
import { observeHttpRequest, normalizePath } from '../metrics/registry.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    const route = normalizePath(req);
    observeHttpRequest(req.method, route, res.statusCode, ms / 1000);
    console.log(
      JSON.stringify({
        level,
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
        ip: (req.ip ?? '').replace(/^::ffff:/, ''),
        userAgent: req.headers['user-agent'] ?? '',
        ts: new Date().toISOString(),
      }),
    );
  });
  next();
}
