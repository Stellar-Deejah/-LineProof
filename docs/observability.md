# Observability

LineProof's reference backend emits structured JSON logs and exposes a health endpoint. This document describes the current observability surface and recommendations for production.

## Health Endpoint

```
GET /health
```

Returns:

```json
{
  "status": "ok",
  "timestamp": "2025-07-01T10:00:00.000Z",
  "environment": "production"
}
```

Use this endpoint for load-balancer health checks and uptime monitors.

`GET /public/health` returns the **same** shape (with a legacy `ts` alias for
`timestamp` kept for backward compatibility), so monitoring tools and load
balancers see one consistent payload regardless of which path they probe
(issue #31 / #33).

## Structured Logging

Every request is logged as a single JSON line:

```json
{
  "level": "INFO",
  "method": "POST",
  "path": "/api/enrollments/enroll",
  "status": 201,
  "ms": 12,
  "ip": "10.0.0.1",
  "userAgent": "Mozilla/5.0",
  "ts": "2025-07-01T10:00:00.000Z"
}
```

Log levels: `INFO` (2xx/3xx), `WARN` (4xx), `ERROR` (5xx).

## Metrics Endpoint

```
GET /metrics
```

Returns Prometheus text (`Content-Type: text/plain; version=0.0.4; charset=utf-8`).
The endpoint is mounted before request logging and rate limiting, so scrapes are
never throttled and do not pollute request metrics with self-traffic (issue #31).

Exposed metrics (in addition to prom-client default process metrics — event-loop
lag, GC, memory, CPU):

| Metric | Type | Labels | Meaning |
|--------|------|--------|---------|
| `http_requests_total` | counter | `method`, `path`, `status` | Total HTTP requests handled |
| `http_request_duration_seconds` | histogram | `method`, `path`, `status` | Request latency distribution |
| `queue_enrollment_total` | counter | `queue_id` | Successful queue enrollments |
| `escrow_deposit_total` | counter | `asset` | Escrow deposits created |
| `escrow_active_gauge` | gauge | — | Escrow records currently `Active` |

`http_*` metrics are recorded by the `requestLogger` middleware; the `path`
label is a normalized route (ids/addresses collapsed to `:id` / `:address`) so
series cardinality stays bounded. `queue_enrollment_total` and
`escrow_deposit_total` are incremented by the enrollment and escrow routes;
`escrow_active_gauge` moves with deposit (+1) and release/refund/expire (−1).

Example scrape (trimmed):

```
# HELP http_requests_total Total HTTP requests handled, labelled by method, route, and status code.
# TYPE http_requests_total counter
http_requests_total{app="lineproof-backend",method="GET",path="/api/queues",status="200"} 42
# HELP http_request_duration_seconds HTTP request duration in seconds...
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.05",method="GET",path="/api/queues",status="200"} 40
http_request_duration_seconds_sum{method="GET",path="/api/queues",status="200"} 0.71
http_request_duration_seconds_count{method="GET",path="/api/queues",status="200"} 42
# HELP queue_enrollment_total Total successful queue enrollments.
# TYPE queue_enrollment_total counter
queue_enrollment_total{app="lineproof-backend",queue_id="sneaker-drop-001"} 187
# TYPE escrow_active_gauge gauge
escrow_active_gauge{app="lineproof-backend"} 12
```

**Should `/metrics` be protected in production?** Metrics can leak operational
detail (traffic shape, error rates, queue ids). Options: keep it internal-only
via network policy (scrape from within the cluster, never expose publicly);
require a bearer token / mTLS on the route; or run it on a separate admin port.
The reference server leaves it open for local dev — gate it before exposing the
backend publicly.

## Rate Limit Headers

All responses include:

- `X-RateLimit-Limit` — requests allowed per window
- `X-RateLimit-Remaining` — requests remaining
- `X-RateLimit-Reset` — Unix timestamp of window reset
- `Retry-After` — seconds to wait (only on 429 responses)

## Recommended Production Setup

| Concern | Recommendation |
|---------|---------------|
| Log aggregation | Ship JSON logs to Datadog, Loki, or CloudWatch |
| Metrics | Add `prom-client` and expose `/metrics` for Prometheus |
| Tracing | Add OpenTelemetry SDK with OTLP exporter |
| Alerting | Alert on 5xx rate > 1%, p99 latency > 500ms, rate limit rate > 5% |
| Uptime | Monitor `/health` from an external probe every 30 seconds |

## Contract Event Indexing

On-chain events are the canonical source of truth. The backend ships an
`EventIndexer` service
([backend/src/services/eventIndexer.ts](../backend/src/services/eventIndexer.ts))
that implements this pipeline (issue #31):

1. **Poll** Soroban RPC `getEvents` on a configurable interval (default 5s),
   from a persisted ledger cursor.
2. **Filter** by the five contract topics: `lineproof.queue`,
   `lineproof.enrollment`, `lineproof.escrow`, `lineproof.identity`,
   `lineproof.factory`.
3. **Deserialize** each raw event into the typed interfaces from
   [`sdk/src/events.ts`](../sdk/src/events.ts) (`AnyLineProofEvent`).
4. **Persist** events through the `StorageAdapter` (namespace `events`) and
   advance the ledger cursor, so restarts resume without gaps or duplicates.

### Architecture

```
Soroban RPC getEvents ──poll(interval)──▶ EventIndexer
                                             │  deserialize (sdk/events.ts types)
                                             ▼
                                        StorageAdapter (events namespace)
                                             │
                                             ▼
                                    GET /api/events (future)
```

The indexer runs only when contract IDs are configured. `fetchRawEvents()` is
the single stub remaining: it returns nothing until the SDK exposes a Soroban
RPC read path (issues #9 / #29); everything around it (interval, cursor,
dedupe, deserialize, persist) is implemented and unit-tested.

### Event log schema

Persisted through the adapter; the durable Postgres shape (see
[docs/backend-persistence.md](backend-persistence.md)) is an `events` table keyed
by `(ledger, namespace, kind, contract_id)` with a `data jsonb` payload and an
index on `ledger` for cursor scans and on `(namespace, kind)` for topic queries.

### Polling vs. streaming

Soroban RPC exposes a **pull-based** `getEvents` with a ledger cursor, not a push
subscription, so polling is the native model. A short interval trades a little
latency and RPC load for simplicity and free gap-recovery via the persisted
cursor; a WebSocket stream would cut latency but needs reconnect/backfill logic
the cursor already provides. Tune `pollIntervalMs` to the deployment's ledger
close time (≈5s on testnet).

See [docs/event-model.md](event-model.md) for the full event schema.
