import 'dotenv/config';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import queueRoutes from './routes/queues.js';
import enrollmentRoutes from './routes/enrollments.js';
import escrowRoutes from './routes/escrow.js';
import publicRoutes from './routes/public.js';
import { errorHandler } from './middleware/errorHandler.js';
import { readLimiter, enrollmentLimiter, escrowLimiter } from './middleware/rateLimiter.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { register, METRICS_CONTENT_TYPE } from './metrics/registry.js';
import { healthPayload } from './health.js';

export function createApp(): Express {
  const app: Express = express();

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.use(helmet());
  app.use(cors({ origin: allowedOrigins }));
  app.use(requestId);

  // GET /metrics is mounted before logging and rate limiting so scrapes are never
  // throttled (issue #31) and don't pollute request metrics with self-traffic.
  app.get('/metrics', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', METRICS_CONTENT_TYPE);
      res.send(await register.metrics());
    } catch (err) {
      next(err);
    }
  });

  app.use(express.json({ limit: '1mb' }));
  // Morgan is a dev-only pretty-printer. requestLogger (below) is the sole
  // source of structured JSON logs in every other environment — mounting
  // both doubled log volume with two incompatible field sets (issue #30).
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }
  app.use(requestLogger);

  // /health is mounted before any rate limiter so uptime monitors and incident
  // responders are never throttled — a 429 here would falsely report the
  // service as down during the exact moments it is polled hardest (issue #108).
  app.get('/health', (req, res) => {
    res.json(healthPayload());
  });

  // Per-route limiters replace the former global limiter so a burst on one
  // route group cannot exhaust the quota of another (issue #108). Read feeds
  // get a high threshold; each write group has its own independent counter.
  app.use('/api/queues', readLimiter, queueRoutes);
  app.use('/api/enrollments', enrollmentLimiter, enrollmentRoutes);
  app.use('/api/escrow', escrowLimiter, escrowRoutes);
  app.use('/public', readLimiter, publicRoutes);

  app.use(errorHandler);
  
  return app;
}

export const app = createApp();
