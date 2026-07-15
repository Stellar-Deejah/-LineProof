# [Architecture] Backend state is fully ephemeral — in-memory stores reset on every server restart

**Labels:** `backend`, `architecture`, `enhancement`, `performance`
**Difficulty:** Expert

---

## Problem

Three architectural problems combine to make the backend unsuitable for any non-trivial deployment:

1. **All services use module-level `Map` and `Array` stores**
   `backend/src/services/enrollmentService.ts` stores enrollment records in `const enrollmentStore = new Map<string, EnrollmentRecord[]>()` and `const queueIndex = new Map<string, Set<string>>()`. `backend/src/services/escrowService.ts` uses `const escrowStore = new Map<string, EscrowRecord>()`. `backend/src/services/queueService.ts` uses `const FIXTURE_QUEUES: Queue[]`. All state is destroyed on process restart. There is no persistence layer of any kind.

2. **Rate limiter state is also in-process**
   `backend/src/middleware/rateLimiter.ts` acknowledges: *"For production use, swap this for a Redis-backed implementation"*. The in-process `Map<string, WindowEntry>` means rate limits are not shared across replicas and are wiped on restart. An attacker can trivially bypass write limits by triggering a restart or deploying multiple instances.

3. **Backend has no real Soroban RPC integration**
   The `.env.example` defines `ENROLLMENT_CONTRACT_ID`, `ESCROW_CONTRACT_ID`, and `QUEUE_FACTORY_CONTRACT_ID` but none of these are imported or used anywhere in the backend source. The backend is a mock API that duplicates the contract state machine in TypeScript without ever reading from or writing to the actual contracts. This means the backend and on-chain state can permanently diverge.

**Impact:** A deployed operator cannot trust queue or enrollment counts, cannot recover state after a crash, and cannot scale horizontally. The backend is a prototype that looks production-ready but is not.

---

## Proposed Solution

**Phase 1 — persistence layer abstraction:**
- Define a `StorageAdapter` interface in `backend/src/storage/adapter.ts` with typed methods: `get`, `set`, `delete`, `list`, and `increment`.
- Provide two implementations: `MemoryAdapter` (current behavior, for tests and local dev) and `PostgresAdapter` (using `node-postgres` or `drizzle-orm`).
- Inject the adapter into each service via a constructor parameter or dependency injection pattern — this also makes service unit tests cleaner.
- Add a `DATABASE_URL` environment variable to `.env.example`.

**Phase 2 — Redis-backed rate limiter:**
- Replace the in-process `Map` in `rateLimiter.ts` with a `StorageAdapter`-backed sliding window, or adopt `express-rate-limit` + `rate-limit-redis`.
- Keep the existing `createRateLimiter` API signature so the change is non-breaking for callers.

**Phase 3 — Soroban RPC bridge (read path):**
- Add a `ContractAdapter` interface in `backend/src/contracts/adapter.ts` with methods mirroring the `@lineproof/sdk` client: `getQueue`, `getEnrollmentRecord`, `getEscrowRecord`.
- Wire the contract IDs from `.env.example` into a `SorobanContractAdapter` backed by the existing SDK `QueueClient`, `EnrollmentClient`, and `EscrowClient`.
- Use this adapter in the `GET` routes to return on-chain state as the authoritative source, falling back to the in-memory store only when the RPC is unavailable.

---

## Acceptance Criteria

- [ ] `StorageAdapter` interface defined with typed `get`, `set`, `delete`, `list`, and `increment` methods
- [ ] `MemoryAdapter` passes all existing service unit tests unchanged
- [ ] `PostgresAdapter` skeleton implemented with migrations in `backend/src/db/migrations/`
- [ ] `DATABASE_URL` documented in `backend/.env.example`
- [ ] Rate limiter uses the storage adapter — in-process `Map` removed from `rateLimiter.ts`
- [ ] `ContractAdapter` interface defined with typed read methods
- [ ] `ENROLLMENT_CONTRACT_ID`, `ESCROW_CONTRACT_ID`, `QUEUE_FACTORY_CONTRACT_ID` are loaded and passed to the adapter
- [ ] `GET /api/queues/:id` prefers on-chain state when contract IDs are configured
- [ ] Existing backend tests still pass with the `MemoryAdapter`
- [ ] `backend/.env.example` updated with new variables and comments explaining each
- [ ] Architecture decision documented in a new `docs/backend-persistence.md`

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Justify the choice of ORM or query library (if any) for the `PostgresAdapter`.
- Explain the fallback strategy when the Soroban RPC is unreachable (cached data vs. error response).
- Describe the database schema for enrollments and escrow records, including indices for the query patterns in use.
- Show the migration file and explain how it would be run in CI and in production.
- Discuss whether the `MemoryAdapter` should be retained long-term or phased out.
