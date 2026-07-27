# Rate Limiting

LineProof's reference backend applies rate limiting to protect against abuse. The
limits described here apply to the in-process implementation. Production deployments
should use a distributed store (Redis) so limits are enforced across replicas.

## Per-Endpoint Limits

Rate limiting is applied **per route group**, not globally. Each group has its own
limiter instance with a private counter namespace, so a burst on one group can
never exhaust the quota of another for the same IP (issue #108).

| Route group | Limiter | Limit | Window | Env override |
|---|---|---|---|---|
| `GET /health` | *(none)* | unlimited | — | — |
| `GET /metrics` | *(none)* | unlimited | — | — |
| `/public/*` (read feeds) | `readLimiter` | 600 requests | 1 minute | `READ_RATE_LIMIT_MAX` |
| `/api/queues/*` (read feeds) | `readLimiter` | 600 requests | 1 minute | `READ_RATE_LIMIT_MAX` |
| `/api/enrollments/*` (writes) | `enrollmentLimiter` | 10 requests | 1 minute | `ENROLLMENT_RATE_LIMIT_MAX` |
| `/api/escrow/*` (writes) | `escrowLimiter` | 10 requests | 1 minute | `ESCROW_RATE_LIMIT_MAX` |

The window for every limiter is configurable via `RATE_LIMIT_WINDOW_MS` (default
`60000`). Counters are keyed by client IP.

### Why `/health` and `/metrics` are never rate-limited

Both are operational endpoints polled by uptime monitors, load balancers, and
Prometheus scrapers. If `/health` returned `429` under heavy polling — precisely
what happens during an incident when responders and monitors hammer it — the
service would be falsely reported as **down** while it is actually healthy. They
are therefore mounted *before* any limiter and excluded entirely.

### Independent write quotas

`enrollmentLimiter` and `escrowLimiter` are separate instances. Exhausting the
enrollment quota (e.g. a bulk-enrollment burst) leaves the escrow quota for the
same IP untouched, so a user can never lock themselves out of escrow deposits by
enrolling too quickly. This is verified by a test in
`backend/src/__tests__/rateLimiter.test.ts`.

### Keying: IP vs. IP + identity

Limiters are currently keyed by client IP alone. This is correct for the
unauthenticated read feeds and adequate for the write routes today, but it has
two known trade-offs once authentication lands:

- **Shared IPs** (NAT, corporate proxies, mobile carriers) share a single quota,
  so many legitimate users behind one IP can throttle each other.
- **IP rotation** lets a single actor with many addresses sidestep the limit.

For authenticated endpoints the limiter should be keyed by **IP + JWT subject /
API key**, falling back to IP for anonymous callers, so quotas track the actual
principal rather than the network path. That change is deferred until auth is in
place.

## Response Headers

Every API response includes the following headers:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining before the limit resets |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait (only present when the limit is exceeded) |

## Exceeded Limit Response

```json
{
  "error": {
    "message": "Too many requests, please try again later.",
    "status": 429
  }
}
```

HTTP status code: `429 Too Many Requests`.

## Customizing Limits

The `createRateLimiter` factory accepts:

```typescript
createRateLimiter({
  max: 100,        // requests per window
  windowMs: 60000, // 1 minute
  message: 'Custom message',
})
```

## Production Recommendations

- Replace the in-process `Map` with `rate-limit-redis` backed store.
- Apply stricter limits to enrollment and escrow deposit endpoints.
- Apply separate rate limits per operator identity, not just per IP, once
  auth is in place.
- Consider token-bucket or leaky-bucket algorithms for smoother burst handling.
