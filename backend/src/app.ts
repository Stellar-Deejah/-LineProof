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
import { defaultRateLimiter, writeRateLimiter } from './middleware/rateLimiter.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { corsOriginsFromEnvironment, createCorsOptions } from './middleware/corsConfig.js';
import { register, METRICS_CONTENT_TYPE } from './metrics/registry.js';
import { healthPayload } from './health.js';

export function createApp(allowedOrigins: string[] = corsOriginsFromEnvironment()): Express {
  const app: Express = express();

  app.use(helmet());
  app.use(cors(createCorsOptions(allowedOrigins)));
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
  app.use(defaultRateLimiter);

  app.get('/health', (req, res) => {
    res.json(healthPayload());
  });

  app.use('/api/queues', queueRoutes);
  app.use('/api/enrollments', writeRateLimiter, enrollmentRoutes);
  app.use('/api/escrow', writeRateLimiter, escrowRoutes);
  app.use('/public', publicRoutes);

  app.use(errorHandler);

  return app;
}
