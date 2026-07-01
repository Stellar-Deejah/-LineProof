/**
 * Structured request logger middleware.
 * In production replace with a proper logging library such as pino or winston.
 */
import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      JSON.stringify({
        level,
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
