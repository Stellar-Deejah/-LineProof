# Changelog

All notable changes to LineProof are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- [contracts/escrow] `get_total_held` function tracking running deposit totals per queue
- [contracts/escrow] `Expired` status now correctly persisted in `expire()` and guarded against non-Active records
- [contracts/queue] `enroll_position` with capacity enforcement, `cancel_position`, and `total_enrolled`
- [contracts/queue] `advaAnce()` precondition: requires `EnrollmentClosed` status; stays in `AdvancementActive` after batch
- [contracts/identity] `initialize`, `revoke`, and `get_admin` functions
- [contracts/identity] `bound_at` timestamp and `Bound` status set correctly on first bind
- [contracts/enrollment] `finalize_enrollment`, `enrollment_count`, and `count_key` helper
- [contracts/enrollment] `DuplicateBehavior` config now consulted in `enroll()`
- [contracts/factory] `list_queues` implemented with slug index; `queue_count` added; `get_queue` returns `None` correctly
- [sdk] `NetworkPassphrase` enum, `QueueStatus`, `EnrollmentRecord`, `EscrowRecord` types
- [sdk] `utils` module: `assertValidAddress`, `toStroops`, `fromStroops`, `truncateAddress`, `daysFromNow`
- [sdk] Typed event definitions for all five contract namespaces in `src/events.ts`
- [backend] `expireEscrow` service function and `POST /api/escrow/expire` endpoint
- [backend] `cancelEnrollment` service function, queue-level enrollment index, and `GET /api/enrollments/queue/:queueId`
- [backend] `advanceQueue`, `closeQueue`, `getQueueStats`, duplicate slug guard
- [backend] In-process rate limiter middleware with configurable window and write-specific limits
- [backend] Structured JSON request logger middleware
- [backend] `validateStellarAddress` middleware for Stellar key field validation
- [backend] Multi-stage Dockerfile with health check
- [frontend] `QueueStatusBadge`, `ProgressBar`, `CopyButton`, `EmptyState`, `Spinner`, `AlertBanner`, `StatCard`, `Tooltip` components
- [frontend] `useQueues`, `useQueue`, `useEnrollment`, `useEscrow` hooks wired to live API
- [frontend] `QueuesPage`, `QueuePage`, `DashboardPage` wired to backend; `NotFoundPage` added
- [frontend] Sticky navbar with active links, footer, Freighter-ready `.env.example`
- [frontend] Multi-stage Dockerfile with nginx and security headers
- [ci] Docker build and push workflow to GHCR
- [ci] CodeQL analysis workflow for TypeScript
- [ci] Backend test job, WASM build verification, and Cargo caching in test workflow
- [ci] Release workflow for SDK npm publish and WASM artifact upload on version tags
- [ci] Manual testnet deployment workflow with environment protection
- [docs] API reference for queues, enrollments, and escrow endpoints
- [docs] Observability, glossary, rate-limiting, error-codes, upgrade guide, governance
- [docs] Incident response and deployment runbooks
- [docs] Privacy considerations, changelog policy, contributing guides for contracts and SDK
- [docs] Healthcare, event-ticketing, visa appointments, and university admissions examples
- [scripts] `fund_testnet_accounts.sh`, `check_contract_storage.sh`, `export_events.sh`
- [backend] `StorageAdapter` persistence seam with `MemoryAdapter` (default) and `PostgresAdapter` skeleton; SQL migrations in `src/db/migrations/` (#4)
- [backend] `ContractAdapter` read seam; `GET /api/queues/:id` prefers on-chain state when contract IDs are configured, falling back to local state (#4)
- [backend] Prometheus `/metrics` endpoint (`http_requests_total`, `http_request_duration_seconds`, `queue_enrollment_total`, `escrow_deposit_total`, `escrow_active_gauge`); excluded from rate limiting (#31)
- [backend] `EventIndexer` service: polls Soroban `getEvents`, deserializes via `sdk/events.ts`, persists through the storage adapter (#31)
- [docs] `vrf-advancement.md`, `contract-storage-ttl.md` (stub), `backend-persistence.md`; refreshed `sdk-architecture.md` and `observability.md` (#35, #31, #4)

### Fixed
- [sdk] **BREAKING**: Fixed critical bug where `Keypair.fromSecret()` was called with public key strings instead of secret keys across all transaction clients (`EnrollmentClient`, `EscrowClient`, `QueueClient`, `IdentityClient`). This caused TypeErrors at runtime and prevented all on-chain interactions. Replaced with `requireKeypair()` helper that validates credentials before transaction building.
- [sdk] **BREAKING**: Fixed read-only contract queries (`getPosition`, `isEnrolled`, `isBound`) that were incorrectly using `Horizon.Server` instead of `SorobanRpc.Server`. Added `sorobanServer` instance to `LineProofClient` and implemented proper Soroban RPC simulation with XDR encoding/decoding for view calls.
- [sdk] Added `LineProofClient.readOnly()` factory method for creating read-only client instances that explicitly disable mutation methods at construction time, providing clearer error messages when credentials are missing.
- [sdk] Removed all `NOT_IMPLEMENTED` errors from SDK - view methods now execute real Soroban contract simulations.
- [backend] Rate limiter no longer keeps an in-process `Map` — counters live in the storage adapter, so limits survive restarts and can be shared across replicas (#4)
- [backend] `GET /health` and `GET /public/health` now return a unified shape (#31, #33)
- [repo] Removed duplicate `packageManager`/`engines` keys in the root `package.json`
- [contracts/escrow] `expire()` now updates record status to `Expired` in storage
- [contracts/queue] `advance()` state machine bug — no longer reverts to `EnrollmentClosed` mid-batch
- [contracts/identity] `bound_at` now set to ledger timestamp on first bind
- [backend] `escrowService` — duplicate deposit now throws 409; release/refund guard wrong-status transitions
- [docker] Port conflicts resolved; healthchecks and postgres service added

## Tracked Issues (#7–#25)

The entries below map every reported bug, security, and limitation issue in the
range #7–#25 to its affected component and a migration note where one applies.
Each item is a **tracked** issue against the current unreleased line: it remains
open until a released version section below lists it as resolved. Issue numbers
refer to the upstream tracker.

> Discrepancy note: issue #35 references "#14 (VRF and PriorityTier advancement
> rules are dead enum variants)". In the upstream tracker that behaviour is
> issue **#17**; #14 is "Implement `isEnrolled`, `getPosition`, `isBound` via
> Soroban RPC simulation". Both are listed below under their real numbers.

### Security

- **#7** — [Security] `validateStellarAddress` middleware is defined and tested but never applied to any route.
  Component: `backend/middleware/validateStellarAddress`. Migration: once wired, requests with malformed Stellar keys will be rejected with `400` before reaching a handler.
- **#13** — Enrollment proof hash is XOR-folded, not cryptographic — trivially forgeable.
  Component: `contracts/enrollment`. Migration: replacing the hash changes stored proof values; existing enrollment proofs will not verify against the new scheme.
- **#15** — `validateStellarAddress` middleware is defined but never applied to any route (upstream duplicate of #7).
  Component: `backend/middleware/validateStellarAddress`. Migration: see #7.
- **#20** — QueueFactory `upgrade_queue()` allows version downgrade and accepts unapproved WASM hashes.
  Component: `contracts/queue-factory`. Migration: adding a monotonic-version and allowlist guard will reject downgrade calls that previously succeeded.

### Bug Fixes

- **#9** — SDK: fix `Keypair.fromSecret` misuse and implement the SorobanRpc read path across all transaction clients.
  Component: `sdk/client`, `sdk/{queue,enrollment,escrow,identity}`. Migration: read methods move from `Horizon.Server` to `SorobanRpc.Server`; integrators must supply a `sorobanRpcUrl`.
- **#10** — `enrollment_count` always returns 0 — counter key never written in `enroll()`.
  Component: `contracts/enrollment`. Migration: none — counts become accurate after the fix.
- **#11** — All SDK transaction methods pass a public key to `Keypair.fromSecret()` — throws at runtime.
  Component: `sdk/{queue,enrollment,escrow,identity}`. Migration: signing will require the configured `privateKey`; callers that only set `publicKey` can no longer submit transactions.
- **#18** — Queue status enum mismatch between backend, frontend, and contracts.
  Component: `backend/services/queueService`, `frontend`, `sdk/types`. Migration: the backend `AdvancementActive`/`Open` set aligns to the contract `Draft | EnrollmentOpen | EnrollmentClosed | AdvancementActive | Closed`; API consumers must map old status strings.
- **#23** — `DuplicateBehavior::GrantWaitingList` and `OverrideExpired` panic in production.
  Component: `contracts/enrollment`. Migration: none — previously-panicking configs become usable.

### Known Limitations

- **#8** — [Frontend] No UI for enrollment cancellation, escrow management, or position status after enrollment.
  Component: `frontend`. Migration: none (additive UI).
- **#12** — Backend is fully ephemeral — no persistence layer, no Soroban integration.
  Component: `backend/services`, `backend/middleware/rateLimiter`. Migration: introduces a `StorageAdapter`; `MemoryAdapter` preserves current behaviour, `PostgresAdapter` requires `DATABASE_URL`. Tracked by #4.
- **#14** — Implement `isEnrolled`, `getPosition`, `isBound` via Soroban RPC simulation.
  Component: `sdk/{enrollment,queue,identity}`. Migration: these methods currently throw `NOT_IMPLEMENTED`; they will resolve to booleans/records once the RPC read path lands.
- **#16** — Frontend: no UI for enrollment cancellation, escrow management, or post-enrollment status (upstream duplicate of #8).
  Component: `frontend`. Migration: none.
- **#17** — VerifiableRandomness and PriorityTier advancement rules are dead enum variants.
  Component: `contracts/queue`, `sdk/types`. Migration: none — selecting these rules currently falls back to FIFO. See [docs/vrf-advancement.md](docs/vrf-advancement.md).
- **#19** — Frontend has no test suite — no component, hook, or integration tests.
  Component: `frontend`. Migration: none.
- **#21** — Backend has no Soroban RPC integration — contract IDs in `.env.example` are unused.
  Component: `backend`. Migration: a `ContractAdapter` reads on-chain state when contract IDs are configured; unset IDs fall back to the in-memory store. Tracked by #4.
- **#22** — Accessibility: `Tooltip` missing `aria-describedby` wiring and live regions absent on form errors.
  Component: `frontend/components`. Migration: none.
- **#24** — Performance: `GET /api/queues` has no pagination and `QueuesPage` renders all cards with no virtualization.
  Component: `backend/routes/queues`, `frontend`. Migration: a future `limit`/`cursor` query contract is additive and backward compatible.
- **#25** — `deployFactory()` generates a fake contract ID — real Soroban deployment is unimplemented.
  Component: `sdk/client`. Migration: the returned ID is not a deployed contract; do not persist it as authoritative.

---

## [0.1.0] — 2025-06-01

### Added
- Initial Soroban contract workspace: `lineproof-queue-factory`, `lineproof-queue`, `lineproof-enrollment`, `lineproof-identity`, `lineproof-escrow`
- TypeScript SDK scaffold (`@lineproof/sdk`)
- Reference Express backend (`@lineproof/backend`)
- Reference React frontend (`@lineproof/frontend`)
- Docker Compose for local Stellar/Soroban testnet
- GitHub Actions: test, lint, security scan workflows
- Documentation: architecture, queue lifecycle, escrow model, anti-scalping, security, threat model, testing strategy, deployment strategy, developer onboarding, use cases
- Research notes: healthcare waitlists, visa appointments, university admissions, event ticketing