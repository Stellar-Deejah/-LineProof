import { Request, Response, NextFunction } from 'express';

export function checkContentLength(limit: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const length = req.headers['content-length'];
    if (length && parseInt(length, 10) > limit) {
      return res.status(413).json({ error: 'Payload Too Large' });
    }
    next();
  };
}
