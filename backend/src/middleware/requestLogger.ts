/**
 * Structured request logger middleware. The single source of per-request
 * logging (issue #202) — nothing else mounts a request logger.
 * In production replace with a proper logging library such as pino or winston.
 *
 * Also records Prometheus HTTP metrics on completion (issue #31):
 * `http_requests_total` and `http_request_duration_seconds`, labelled by
 * method, normalized route, and status code.
 */
import type { Request, Response, NextFunction } from 'express';
import { observeHttpRequest, normalizePath } from '../metrics/registry.js';

const LEVEL_COLOR: Record<string, string> = {
  INFO: '\x1b[32m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
};
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    const route = normalizePath(req);
    observeHttpRequest(req.method, route, res.statusCode, ms / 1000);

    if (process.env.NODE_ENV === 'development') {
      // Colored one-line summary for local dev, replacing morgan("dev").
      // Every other environment gets the structured JSON line below —
      // exactly one log line per request either way.
      const color = LEVEL_COLOR[level] ?? '';
      console.log(
        `${color}${level}${RESET} ${req.method} ${req.path} ${color}${res.statusCode}${RESET} ${DIM}${ms}ms${RESET}`,
      );
      return;
    }

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
