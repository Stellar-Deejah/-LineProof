import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import queueRoutes from "./routes/queues.js";
import enrollmentRoutes from "./routes/enrollments.js";
import escrowRoutes from "./routes/escrow.js";
import publicRoutes from "./routes/public.js";
import { errorHandler } from "./middleware/errorHandler.js";
import {
  defaultRateLimiter,
  writeRateLimiter,
} from "./middleware/rateLimiter.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { register, METRICS_CONTENT_TYPE } from "./metrics/registry.js";
import { healthPayload } from "./health.js";
import { config, validateStartupConfig } from "./config.js";
import { lineproofClient } from "./contracts/lineproofClient.js";
import { EventIndexer } from "./services/eventIndexer.js";

const app: Express = express();

validateStartupConfig(config);
console.log(
  lineproofClient
    ? `[contracts] configured mode (${lineproofClient.canWrite ? "read/write" : "read-only; OPERATOR_SECRET_KEY absent"})`
    : "[contracts] mock mode (no contract IDs configured)",
);

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins }));

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

app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(requestLogger);
app.use(defaultRateLimiter);

app.get("/health", (req, res) => {
  res.json(healthPayload());
});

app.use("/api/queues", queueRoutes);
app.use("/api/enrollments", writeRateLimiter, enrollmentRoutes);
app.use("/api/escrow", writeRateLimiter, escrowRoutes);
app.use("/public", publicRoutes);

app.use(errorHandler);

// Contract event indexer (issue #31). Runs only when contract IDs are
// configured; the poll loop is a no-op until the SDK Soroban RPC read path
// lands. The interval is unref'd so it never blocks process exit.
let eventIndexer: EventIndexer | undefined;
if (config.contractsConfigured) {
  eventIndexer = new EventIndexer({
    contractIds: Object.values(config.contractIds).filter((id): id is string =>
      Boolean(id),
    ),
  });
  eventIndexer.start();
}

const port = config.port;
app.listen(port, () => {
  console.log(`LineProof backend listening on :${port} [${config.nodeEnv}]`);
});

export { app, eventIndexer };
