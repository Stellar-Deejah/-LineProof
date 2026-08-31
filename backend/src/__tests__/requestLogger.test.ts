import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requestLogger } from '../middleware/requestLogger.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/queues',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    ...overrides,
  } as unknown as Request;
}

function makeRes(statusCode = 200, requestId = 'test-request-id') {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    statusCode,
    locals: { requestId },
    on: (event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    emit: (event: string) => {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  } as unknown as Response & { emit: (e: string) => void };
}

// Typed as `unknown` to avoid MockInstance generic conflicts across Vitest versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logSpy: any;

describe('requestLogger', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    logSpy?.mockRestore();
  });

  it('calls next()', () => {
    const next = vi.fn() as unknown as NextFunction;
    requestLogger(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('logs INFO for 2xx on finish', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes(200);
    requestLogger(makeReq(), res, next);
    res.emit('finish');
    expect(logSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(String(logSpy.mock.calls[0][0])) as {
      level: string;
      status: number;
      method: string;
      requestId: string;
    };
    expect(logged.level).toBe('INFO');
    expect(logged.status).toBe(200);
    expect(logged.method).toBe('GET');
    expect(logged.requestId).toBe('test-request-id');
  });

  it('logs WARN for 4xx on finish', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes(404);
    requestLogger(makeReq(), res, next);
    res.emit('finish');
    const logged = JSON.parse(String(logSpy.mock.calls[0][0])) as { level: string };
    expect(logged.level).toBe('WARN');
  });

  it('logs ERROR for 5xx on finish', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes(500);
    requestLogger(makeReq(), res, next);
    res.emit('finish');
    const logged = JSON.parse(String(logSpy.mock.calls[0][0])) as { level: string };
    expect(logged.level).toBe('ERROR');
  });

  it('logs the requestId set by the requestId middleware, so it can correlate with errorHandler on a failing request', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes(500, 'req-abc-123');
    requestLogger(makeReq(), res, next);
    res.emit('finish');
    const logged = JSON.parse(String(logSpy.mock.calls[0][0])) as { requestId: string };
    expect(logged.requestId).toBe('req-abc-123');
  });
});
