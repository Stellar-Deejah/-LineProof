import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../errors/index.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Operational errors include a numeric HTTP status
  const status: number = typeof err.status === 'number' ? err.status : 500;
  const message: string = err.message ?? 'Internal Server Error';
  const requestId = res.locals.requestId as string | undefined;
  const details = err instanceof HttpError ? err.details : undefined;

  if (process.env.NODE_ENV !== 'test') {
    console.error(
      `[${new Date().toISOString()}] ${req.method} ${req.path} → ${status}: ${message}` +
        (requestId ? ` (requestId=${requestId})` : ''),
    );
    if (status >= 500) {
      console.error(err.stack);
    }
  }

  res.status(status).json({
    error: {
      message,
      status,
      path: req.path,
      timestamp: new Date().toISOString(),
      requestId,
      ...(details ?? {}),
      ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
  });
};
