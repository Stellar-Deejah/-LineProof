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
- [contracts/queue] `advance()` precondition: requires `EnrollmentClosed` status; stays in `AdvancementActive` after batch
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

### Fixed
- [sdk] **BREAKING**: Fixed critical bug where `Keypair.fromSecret()` was called with public key strings instead of secret keys across all transaction clients (`EnrollmentClient`, `EscrowClient`, `QueueClient`, `IdentityClient`). This caused TypeErrors at runtime and prevented all on-chain interactions. Replaced with `requireKeypair()` helper that validates credentials before transaction building.
- [sdk] **BREAKING**: Fixed read-only contract queries (`getPosition`, `isEnrolled`, `isBound`) that were incorrectly using `Horizon.Server` instead of `SorobanRpc.Server`. Added `sorobanServer` instance to `LineProofClient` and implemented proper Soroban RPC simulation with XDR encoding/decoding for view calls.
- [sdk] Added `LineProofClient.readOnly()` factory method for creating read-only client instances that explicitly disable mutation methods at construction time, providing clearer error messages when credentials are missing.
- [sdk] Removed all `NOT_IMPLEMENTED` errors from SDK - view methods now execute real Soroban contract simulations.
- [contracts/escrow] `expire()` now updates record status to `Expired` in storage
- [contracts/queue] `advance()` state machine bug — no longer reverts to `EnrollmentClosed` mid-batch
- [contracts/identity] `bound_at` now set to ledger timestamp on first bind
- [backend] `escrowService` — duplicate deposit now throws 409; release/refund guard wrong-status transitions
- [docker] Port conflicts resolved; healthchecks and postgres service added

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
