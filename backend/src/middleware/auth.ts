import { timingSafeEqual as tsEql } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const HEADER_NAME = 'x-api-key';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.OPERATOR_API_KEY;
  if (!expected) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const provided = req.headers[HEADER_NAME];
  if (typeof provided !== 'string' || !provided) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  const match =
    expectedBuf.length === providedBuf.length &&
    tsEql(expectedBuf, providedBuf);

  if (!match) {
    res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
    return;
  }

  next();
}
