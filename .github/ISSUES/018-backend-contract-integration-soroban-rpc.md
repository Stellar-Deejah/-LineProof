# [Enhancement] Backend has no Soroban RPC integration — contract IDs in `.env.example` are unused

**Labels:** `backend`, `enhancement`, `api`, `architecture`
**Difficulty:** Expert

---

## Problem

Three architectural gaps prevent the backend from functioning as anything beyond a mock API:

1. **Contract IDs in `.env.example` are never loaded or used**
   `backend/.env.example` defines `ENROLLMENT_CONTRACT_ID`, `ESCROW_CONTRACT_ID`, and `QUEUE_FACTORY_CONTRACT_ID`. None of these variables are imported in `backend/src/index.ts`, `queueService.ts`, `enrollmentService.ts`, or `escrowService.ts`. The backend API is entirely backed by the in-memory mock store regardless of what contract IDs are configured. Any write operation (`POST /api/enrollments/enroll`) mutates the in-memory store only — no Soroban transaction is submitted.

2. **Write routes do not submit Soroban transactions**
   `POST /api/enrollments/enroll` calls `enrollIdentity()` which writes to a `Map`. It should use the SDK `EnrollmentClient.enroll()` to submit an `enroll` transaction to the configured contract. Same for `POST /api/escrow/deposit` (should call `EscrowClient.deposit()`), `POST /api/queues/:id/advance` (should call `QueueClient.advance()`), and `POST /api/queues/:id/close` (should call `QueueClient.close()`).

3. **Read routes do not query on-chain state**
   `GET /api/enrollments/:identity` returns `enrollmentStore.get(identity)`. It should query the enrollment contract via `EnrollmentClient.isEnrolled()` or a contract storage read, then aggregate results. `GET /api/escrow/:id` reads `escrowStore.get(id)` — it should query the escrow contract record via the SDK. Without this, any participant who enrolled directly on-chain (bypassing the backend) will appear unenrolled in the API.

**Impact:** The backend cannot be used in a real deployment. Any operator who exposes the backend API to participants is providing a mock that disagrees with on-chain state. The SDK already has the transaction-building infrastructure in place; the backend just needs to be wired up.

---

## Proposed Solution

**Environment loading:**
- Load `ENROLLMENT_CONTRACT_ID`, `ESCROW_CONTRACT_ID`, `QUEUE_FACTORY_CONTRACT_ID`, `SOROBAN_RPC_URL`, `NETWORK_PASSPHRASE`, and `OPERATOR_SECRET_KEY` from `.env` in `backend/src/index.ts`.
- Validate required variables on startup; fail fast with a clear error if any are missing (except `OPERATOR_SECRET_KEY` which may be absent for read-only deployments).

**SDK client initialization:**
- Create `backend/src/contracts/lineproofClient.ts` that instantiates `LineProofClient` with the loaded config and exposes typed `enrollmentClient`, `escrowClient`, and `queueClient` instances.
- Export a single `contractClients` singleton used by all route handlers.

**Write path integration:**
- In `enrollmentRoutes.ts`, replace `enrollIdentity()` with `contractClients.enrollmentClient.enroll()`. Store the returned transaction hash and contract-assigned `proof_hash` in the persistence layer (once implemented per issue #009).
- Similarly wire `escrow/deposit`, `queues/advance`, and `queues/close`.

**Read path integration (dual-source with fallback):**
- Attempt to read from on-chain state first using the SDK. If the RPC is unavailable or contract IDs are not configured, fall back to the in-memory store with a `X-Data-Source: mock` response header to signal the degraded state.

---

## Acceptance Criteria

- [ ] `ENROLLMENT_CONTRACT_ID`, `ESCROW_CONTRACT_ID`, `QUEUE_FACTORY_CONTRACT_ID`, `SOROBAN_RPC_URL`, `NETWORK_PASSPHRASE` loaded from environment on startup
- [ ] Startup fails with a clear error message if required variables are missing
- [ ] `backend/src/contracts/lineproofClient.ts` exports a typed singleton client
- [ ] `POST /api/enrollments/enroll` submits a Soroban transaction when contract IDs are configured
- [ ] `POST /api/escrow/deposit` submits a Soroban transaction when contract IDs are configured
- [ ] `POST /api/queues/:id/advance` submits a Soroban transaction when contract IDs are configured
- [ ] `GET` routes attempt on-chain read first, fall back gracefully with `X-Data-Source: mock` header
- [ ] Integration behaves correctly in mock mode (no env vars set) for local dev and CI
- [ ] `backend/.env.example` updated with all new variables and inline documentation
- [ ] Existing unit tests still pass in mock mode (contract client not initialized)

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Show the startup log output for both the configured (with contract IDs) and unconfigured (mock) modes.
- Explain the error handling strategy when a Soroban transaction is submitted but the network is unreachable — does the API return a 503, a 202 (pending), or a 500?
- Describe how you handle the case where `OPERATOR_SECRET_KEY` is absent but a write operation is requested.
- Include a local testnet smoke-test log showing a successful `POST /api/enrollments/enroll` that results in an on-chain transaction.
