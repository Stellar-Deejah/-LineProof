import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function requireOperatorAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.operatorSecretKey) {
    return res.status(401).json({ message: 'Operator authentication key not configured on server' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: Missing or invalid token format' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== config.operatorSecretKey) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }

  next();
}
