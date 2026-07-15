# Backend Persistence Architecture

Status: **Phase 1 landed (StorageAdapter + MemoryAdapter), Phase 2 landed
(adapter-backed rate limiter), Phase 3 scaffolded (ContractAdapter read path).**
Tracked by issue #4 (and related #12, #21).

## Problem

The backend historically kept every piece of state in module-level `Map`/`Array`
stores: enrollments, escrow records, queue fixtures, and rate-limit counters.
Three consequences followed:

1. **All state was ephemeral** — a restart wiped enrollments and escrow.
2. **Rate limits were per-process** — not shared across replicas and resettable
   by forcing a restart.
3. **No on-chain integration** — the backend duplicated the contract state
   machine in TypeScript and could permanently diverge from the chain.

## Design: three seams

### 1. `StorageAdapter` (persistence seam)

[`backend/src/storage/adapter.ts`](../backend/src/storage/adapter.ts) defines a
five-method interface — `get`, `set`, `delete`, `list`, `increment` — typed as
`Awaitable<T>` so one interface serves both a synchronous in-memory store and an
asynchronous networked store.

| Implementation | File | Semantics |
|----------------|------|-----------|
| `MemoryAdapter` | `storage/memoryAdapter.ts` | Synchronous, in-process, **reference-preserving** (so services that mutate returned records keep working). Default. |
| `PostgresAdapter` | `storage/postgresAdapter.ts` | Async skeleton for durable/multi-replica deployments. Selected via `DATABASE_URL`. |

Services (`enrollmentService`, `escrowService`, `queueService`) now read and
write through the shared `defaultMemoryAdapter` instead of raw Maps. Because the
`MemoryAdapter` returns the exact stored reference, the existing service unit
tests pass unchanged.

### 2. Rate limiter (Phase 2)

[`middleware/rateLimiter.ts`](../backend/src/middleware/rateLimiter.ts) no longer
owns a private `Map`; its window counters live in a `StorageAdapter`. The public
`createRateLimiter(options)` signature is unchanged, so callers are unaffected.
A shared store (Redis/Postgres) makes limits durable and replica-wide; because a
networked store is async, that variant needs an async middleware — the
in-process default stays synchronous.

### 3. `ContractAdapter` (Phase 3, read path)

[`contracts/adapter.ts`](../backend/src/contracts/adapter.ts) mirrors the SDK
read surface (`getQueue`, `getEnrollmentRecord`, `getEscrowRecord`).
`SorobanContractAdapter` wires the configured contract IDs into the
`@lineproof/sdk` clients. `GET /api/queues/:id` prefers on-chain state when
contract IDs are configured and annotates the response `source` as `on-chain`
or `in-memory`.

## Configuration

`.env.example` documents the new variables (`DATABASE_URL`, and the canonical
`QUEUE_FACTORY_CONTRACT_ID` / `QUEUE_CONTRACT_ID` / `ENROLLMENT_CONTRACT_ID` /
`IDENTITY_CONTRACT_ID` / `ESCROW_CONTRACT_ID`, with the legacy `LINEPROOF_`
aliases still honoured). [`config.ts`](../backend/src/config.ts) centralises all
`process.env` access.

## Decisions and trade-offs

**ORM / query library.** The schema is plain SQL
([`db/migrations/0001_init.sql`](../backend/src/db/migrations/0001_init.sql)) so
the `PostgresAdapter` can be implemented with `node-postgres` (`pg`) directly —
minimal dependency surface, transparent SQL — or with `drizzle-orm` if typed
query builders are preferred later. No ORM is committed to yet; the migration is
runner-agnostic and applies with `psql -f`.

**Schema.** A generic `kv_store (namespace, key, value jsonb)` and
`kv_counter (…, expires_at)` back the adapter surface. Typed `enrollments` and
`escrow_records` tables back the hot query patterns, with indices on
`enrollments(identity)`, a partial index on active rows
`enrollments(queue_id) WHERE cancelled = FALSE`, and `escrow_records(queue_id)` /
`(status)`.

**Soroban RPC fallback.** `readQueueOnChain()` returns `undefined` (→ serve local
state) on a `ContractReadUnavailableError` — which covers both "SDK read path not
implemented yet" and "RPC unreachable" — and only rethrows genuinely unexpected
errors. This keeps the API responsive during an RPC outage rather than failing
reads. A future refinement is a short-lived cache of the last known on-chain
value to serve during outages.

**Migrations in CI/production.** In CI, apply `0001_init.sql` against a disposable
Postgres service before the backend test job; in production, run migrations as a
release step (or an init container) before rolling new backend instances.

**Should `MemoryAdapter` be retained?** Yes — long-term as the test/local-dev
adapter. It keeps unit tests fast and hermetic and gives contributors a
zero-dependency run path. Production selects `PostgresAdapter` via `DATABASE_URL`.

## Acceptance mapping (issue #4)

- StorageAdapter with `get/set/delete/list/increment` — `storage/adapter.ts`.
- MemoryAdapter passes existing service tests unchanged — see `src/__tests__/`.
- PostgresAdapter skeleton + migrations — `storage/postgresAdapter.ts`, `db/migrations/`.
- `DATABASE_URL` documented — `.env.example`.
- Rate limiter uses the adapter, Map removed — `middleware/rateLimiter.ts`.
- ContractAdapter read interface — `contracts/adapter.ts`.
- Contract IDs loaded and passed to the adapter — `config.ts` → `contracts/index.ts`.
- `GET /api/queues/:id` prefers on-chain state — `routes/queues.ts`.
