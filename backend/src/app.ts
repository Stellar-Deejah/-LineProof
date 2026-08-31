import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import queueRoutes from "./routes/queues.js";
import enrollmentRoutes from "./routes/enrollments.js";
import escrowRoutes from "./routes/escrow.js";
import publicRoutes from "./routes/public.js";
import webhookRoutes from "./routes/webhooks.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  readLimiter,
  enrollmentLimiter,
  escrowLimiter,
} from "./middleware/rateLimiter.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { register, METRICS_CONTENT_TYPE } from "./metrics/registry.js";
import { healthPayload } from "./health.js";
import { startWebhookDispatcher } from "./services/webhookDispatcher.js";
import { checkContentLength } from "./middleware/contentLength.js";
import { createCorsOptions } from "./middleware/corsConfig.js";

import { deprecationMiddleware } from "./middleware/deprecation.js";

export function createApp(): Express {
  startWebhookDispatcher();
  const app: Express = express();
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);

  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());

  app.use(helmet());
  app.use(cors(createCorsOptions(allowedOrigins)));
  app.use(requestId);

  // GET /metrics is mounted before logging and rate limiting so scrapes are never
  // throttled (issue #31) and don't pollute request metrics with self-traffic.
  app.get("/metrics", async (_req, res, next) => {
    try {
      res.setHeader("Content-Type", METRICS_CONTENT_TYPE);
      res.send(await register.metrics());
    } catch (err) {
      next(err);
    }
  });

  app.use(checkContentLength(16384));
  app.use(express.json({ limit: "16kb" }));
  // requestLogger is the single logging source in every environment: JSON in
  // production/test, a colored one-line summary in development. Morgan was
  // removed (issue #202) — mounting it alongside requestLogger doubled log
  // volume with two incompatible field sets.
  app.use(requestLogger);

  // /health is mounted before any rate limiter so uptime monitors and incident
  // responders are never throttled — a 429 here would falsely report the
  // service as down during the exact moments it is polled hardest (issue #108).
  app.get("/health", (req, res) => {
    res.json(healthPayload());
  });

  // Canonical Version 1 Routes (/api/v1/)
  app.use("/api/v1/queues", readLimiter, queueRoutes);
  app.use("/api/v1/enrollments", enrollmentLimiter, enrollmentRoutes);
  app.use("/api/v1/escrow", escrowLimiter, escrowRoutes);
  app.use("/api/v1/webhooks", webhookRoutes);

  // Legacy Unversioned Routes (/api/) with Deprecation Warning Header
  app.use("/api/queues", deprecationMiddleware, readLimiter, queueRoutes);
  app.use("/api/enrollments", deprecationMiddleware, enrollmentLimiter, enrollmentRoutes);
  app.use("/api/escrow", deprecationMiddleware, escrowLimiter, escrowRoutes);
  app.use("/api/webhooks", deprecationMiddleware, webhookRoutes);

  app.use("/public", readLimiter, publicRoutes);

  app.use(errorHandler);

  return app;
}
