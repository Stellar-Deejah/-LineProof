/**
 * Simple in-process rate limiter middleware.
 *
 * Uses a sliding-window counter keyed on IP address. For production use,
 * swap this for a Redis-backed implementation (e.g. `express-rate-limit` +
 * `rate-limit-redis`) so limits are shared across multiple API replicas.
 */

import type { Request, Response, NextFunction } from 'express';

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

export interface RateLimitOptions {
  /** Maximum requests allowed within the window. Default: 60 */
  max?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** HTTP status code returned when the limit is exceeded. Default: 429 */
  statusCode?: number;
  /** Message returned in the response body when the limit is exceeded. */
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const max = options.max ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const statusCode = options.statusCode ?? 429;
  const message = options.message ?? 'Too many requests, please try again later.';

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(key, entry);
    } else {
      entry.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(statusCode).json({ error: { message, status: statusCode } });
    }

    next();
  };
}

/** Default rate limiter: 60 req/min per IP */
export const defaultRateLimiter = createRateLimiter();

/** Strict rate limiter for write operations: 20 req/min per IP */
export const writeRateLimiter = createRateLimiter({ max: 20, message: 'Write rate limit exceeded.' });
