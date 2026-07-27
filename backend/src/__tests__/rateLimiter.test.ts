import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  readLimiter,
  enrollmentLimiter,
  escrowLimiter,
} from '../middleware/rateLimiter.js';

function mockReq(ip = '127.0.0.1'): Request {
  return { ip, socket: { remoteAddress: ip }, headers: {} } as unknown as Request;
}

function mockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; headers: Record<string, string | number> } {
  const headers: Record<string, string | number> = {};
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = {
    setHeader: (k: string, v: string | number) => { headers[k] = v; },
    status,
    headers,
  } as unknown as Response;
  return { res, status, json, headers };
}

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
    const req = mockReq('10.0.0.1');
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < 3; i++) {
      const { res } = mockRes();
      limiter(req, res, next);
    }
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('blocks requests over the limit with 429', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const req = mockReq('10.0.0.2');
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < 2; i++) {
      const { res } = mockRes();
      limiter(req, res, next);
    }

    const { res, status } = mockRes();
    limiter(req, res, next);
    expect(status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2); // not called on the 3rd
  });

  it('sets X-RateLimit headers on each response', () => {
    const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });
    const req = mockReq('10.0.0.3');
    const next = vi.fn() as unknown as NextFunction;
    const { res, headers } = mockRes();
    limiter(req, res, next);
    expect(headers['X-RateLimit-Limit']).toBe(10);
    expect(typeof headers['X-RateLimit-Remaining']).toBe('number');
    expect(typeof headers['X-RateLimit-Reset']).toBe('number');
  });
});

/**
 * Drive a limiter `count` times for a single IP and report how many requests
 * were allowed through (i.e. `next()` was called) vs. blocked with the status.
 */
function drive(
  limiter: (req: Request, res: Response, next: NextFunction) => unknown,
  ip: string,
  count: number,
): { allowed: number; blocked: number } {
  let allowed = 0;
  let blocked = 0;
  for (let i = 0; i < count; i++) {
    const next = vi.fn() as unknown as NextFunction;
    const { res, status } = mockRes();
    limiter(mockReq(ip), res, next);
    if ((next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0) allowed++;
    if (status.mock.calls.length > 0) blocked++;
  }
  return { allowed, blocked };
}

describe('per-route limiter instances (issue #108)', () => {
  it('readLimiter allows a high-volume read burst (>60/min)', () => {
    // 100 read requests must all pass; the old 60/min global would have blocked.
    const { allowed, blocked } = drive(readLimiter, '198.51.100.1', 100);
    expect(allowed).toBe(100);
    expect(blocked).toBe(0);
  });

  it('enrollmentLimiter caps writes at 10/min per IP', () => {
    const { allowed, blocked } = drive(enrollmentLimiter, '198.51.100.2', 12);
    expect(allowed).toBe(10);
    expect(blocked).toBe(2);
  });

  it('exhausting the enrollment limiter does NOT block escrow writes for the same IP', () => {
    const ip = '198.51.100.3';
    // Blow past the enrollment quota for this IP.
    const enrollment = drive(enrollmentLimiter, ip, 15);
    expect(enrollment.blocked).toBeGreaterThan(0);

    // Escrow uses an independent counter namespace, so the same IP still has
    // its full escrow quota available.
    const escrow = drive(escrowLimiter, ip, 10);
    expect(escrow.allowed).toBe(10);
    expect(escrow.blocked).toBe(0);
  });
});
