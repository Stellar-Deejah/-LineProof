/**
 * Prometheus metrics registry (issue #31).
 *
 * Exposes a single `register` scraped by `GET /metrics`, plus typed helpers so
 * middleware and services record metrics without importing prom-client directly.
 * Default process metrics (event loop lag, GC, memory, CPU) are collected too.
 */
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();
register.setDefaultLabels({ app: 'lineproof-backend' });
collectDefaultMetrics({ register });

/** Content type Prometheus expects when scraping `/metrics`. */
export const METRICS_CONTENT_TYPE = register.contentType; // text/plain; version=0.0.4; charset=utf-8

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled, labelled by method, route, and status code.',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labelled by method, route, and status code.',
  labelNames: ['method', 'path', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const queueEnrollmentTotal = new Counter({
  name: 'queue_enrollment_total',
  help: 'Total successful queue enrollments.',
  labelNames: ['queue_id'] as const,
  registers: [register],
});

const escrowDepositTotal = new Counter({
  name: 'escrow_deposit_total',
  help: 'Total escrow deposits created.',
  labelNames: ['asset'] as const,
  registers: [register],
});

const escrowActiveGauge = new Gauge({
  name: 'escrow_active_gauge',
  help: 'Number of escrow records currently in the Active state.',
  registers: [register],
});

/**
 * Collapse high-cardinality path params (ids, addresses, slugs) into stable
 * labels so the metric series count stays bounded.
 */
export function normalizePath(req: { baseUrl?: string; route?: { path?: string }; path: string }): string {
  if (req.route?.path) {
    return `${req.baseUrl ?? ''}${req.route.path}` || '/';
  }
  const collapsed = req.path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ':id';
      if (/^[GC][A-Z2-7]{55}$/.test(seg)) return ':address'; // Stellar keys
      if (seg.length > 24 || /\d/.test(seg)) return ':id';
      return seg;
    })
    .join('/');
  return collapsed || '/';
}

/** Record one completed HTTP request. */
export function observeHttpRequest(method: string, path: string, status: number, durationSeconds: number): void {
  const labels = { method, path, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);
}

/** Increment the enrollment counter for a queue. */
export function recordEnrollment(queueId: string): void {
  queueEnrollmentTotal.inc({ queue_id: queueId });
}

/** Increment the escrow deposit counter and the active-escrow gauge. */
export function recordEscrowDeposit(asset: string): void {
  escrowDepositTotal.inc({ asset });
  escrowActiveGauge.inc();
}

/** Decrement the active-escrow gauge when a record leaves the Active state. */
export function recordEscrowClosed(): void {
  escrowActiveGauge.dec();
}
