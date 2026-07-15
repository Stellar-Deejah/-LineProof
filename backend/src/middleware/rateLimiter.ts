/**
 * Rate limiter middleware backed by a {@link StorageAdapter}.
 *
 * The previous implementation kept its own module-level `Map`, so limits were
 * per-process: they were wiped on restart and not shared across replicas, which
 * let an attacker reset counters by forcing a restart or fanning out across
 * instances (issue #4 / #12). The counter now lives in a `StorageAdapter`.
 *
 * The default adapter is the shared in-process `MemoryAdapter`, so behaviour and
 * the synchronous `createRateLimiter(options)` signature are unchanged. Swapping
 * in a shared store (Redis/Postgres) makes limits durable and replica-wide; a
 * networked store would use an async adapter and an async middleware variant.
 */

import type { Request, Response, NextFunction } from 'express';
import { MemoryAdapter } from '../storage/memoryAdapter.js';
import { defaultMemoryAdapter } from '../storage/index.js';

interface WindowMeta {
  resetAt: number;
}

export interface RateLimitOptions {
  /** Maximum requests allowed within the window. Default: 60 */
  max?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** HTTP status code returned when the limit is exceeded. Default: 429 */
  statusCode?: number;
  /** Message returned in the response body when the limit is exceeded. */
  message?: string;
  /**
   * Storage adapter holding the counters. Defaults to the shared in-process
   * `MemoryAdapter`. Typed as the synchronous adapter so the middleware stays
   * synchronous; a networked store needs an async variant.
   */
  store?: MemoryAdapter;
}

/** Monotonic id so each limiter instance keeps its counters in a private namespace. */
let limiterSeq = 0;

export function createRateLimiter(options: RateLimitOptions = {}) {
  const max = options.max ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const statusCode = options.statusCode ?? 429;
  const message = options.message ?? 'Too many requests, please try again later.';
  const store = options.store ?? defaultMemoryAdapter;

  const id = limiterSeq++;
  const winNs = `ratelimit:win:${id}`;
  const cntNs = `ratelimit:cnt:${id}`;

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
    const now = Date.now();

    const meta = store.get<WindowMeta>(winNs, key);
    let resetAt: number;
    if (!meta || now > meta.resetAt) {
      resetAt = now + windowMs;
      store.set<WindowMeta>(winNs, key, { resetAt });
      store.delete(cntNs, key);
    } else {
      resetAt = meta.resetAt;
    }

    const count = store.increment(cntNs, key, 1, windowMs);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (count > max) {
      res.setHeader('Retry-After', Math.ceil((resetAt - now) / 1000));
      return res.status(statusCode).json({ error: { message, status: statusCode } });
    }

    next();
  };
}

/** Default rate limiter: 60 req/min per IP */
export const defaultRateLimiter = createRateLimiter();

/** Strict rate limiter for write operations: 20 req/min per IP */
export const writeRateLimiter = createRateLimiter({ max: 20, message: 'Write rate limit exceeded.' });
