import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that adds Deprecation headers to legacy unversioned /api/ endpoints.
 * Instructs API consumers to migrate to the canonical /api/v1/ namespace.
 */
export function deprecationMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Deprecation', 'true');
  const successorUrl = `${req.baseUrl.replace(/^\/api/, '/api/v1')}${req.path}`;
  res.setHeader('Link', `<${successorUrl}>; rel="successor-version"`);
  next();
}
