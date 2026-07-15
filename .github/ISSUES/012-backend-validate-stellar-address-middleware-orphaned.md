# [Security] `validateStellarAddress` middleware is defined and tested but never applied to any route

**Labels:** `security`, `backend`, `bug`, `api`
**Difficulty:** Advanced

---

## Problem

Two related security gaps leave the backend's address validation completely bypassed:

1. **`validateStellarAddress` is orphaned — never mounted on any route**
   `backend/src/middleware/validateStellarAddress.ts` defines a well-tested middleware factory that validates Stellar public key fields against `/^G[A-Z2-7]{55}$/`. It is imported and tested in `backend/src/__tests__/validateStellarAddress.test.ts`. But it is **never imported in any route file**. The `enrollments.ts`, `escrow.ts`, and `queues.ts` route files never call `validateStellarAddress(['identity'])` or any equivalent. This means any string — including a secret key starting with `S…`, an empty string, or an XSS payload — can be submitted as the `identity` field in `POST /api/enrollments/enroll`, `POST /api/enrollments/cancel`, `POST /api/escrow/deposit`, and `POST /api/escrow/release`.

2. **Zod schemas accept arbitrary strings for identity/address fields**
   `backend/src/routes/enrollments.ts` — `EnrollSchema` uses `z.string().min(1)` for `identity`. `backend/src/routes/escrow.ts` — `DepositSchema` uses `z.string().min(1)` for `identity`. Neither schema applies format validation. The Zod `z.string().regex()` validator should be added to reject non-Stellar strings at the schema layer, providing a second line of defence independent of the middleware.

**Impact:** An attacker can enroll arbitrary strings as identities, including private keys (accidental paste), HTML/script injection strings stored in the mock data store, or garbage values that would cause contract invocation failures when the backend eventually integrates with Soroban. A leaked `S…` key submitted as `identity` could expose a user's signing key in API logs (`requestLogger.ts` logs the full path and status; body logging could expose this if ever added).

---

## Proposed Solution

**Route-level middleware application:**
- In `backend/src/routes/enrollments.ts`, add `validateStellarAddress(['identity'])` as route-specific middleware on `POST /enroll` and `POST /cancel`.
- In `backend/src/routes/escrow.ts`, add `validateStellarAddress(['identity'])` on `POST /deposit`, `POST /release`, and `POST /refund`.

**Zod schema hardening:**
- Extract the Stellar public key regex into a shared Zod schema in `backend/src/schemas/stellar.ts`: `export const StellarAddress = z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar public key')`.
- Replace `z.string().min(1)` for `identity` fields in `EnrollSchema`, `CancelSchema`, and `DepositSchema` with `StellarAddress`.

**`escrowId` format validation:**
- The `EscrowActionSchema` in `escrow.ts` accepts `escrowId: z.string().min(1)`. The actual escrow ID format is `"${queueId}:${identity}"`. Add a Zod `refine` that validates the format and that the embedded identity portion passes the Stellar address regex.

**Test coverage:**
- Add route-level tests (as part of issue #003 / `supertest` suite) that submit non-Stellar identity strings and assert `400` with a specific field-level error message.

---

## Acceptance Criteria

- [ ] `validateStellarAddress(['identity'])` is applied to `POST /api/enrollments/enroll`
- [ ] `validateStellarAddress(['identity'])` is applied to `POST /api/enrollments/cancel`
- [ ] `validateStellarAddress(['identity'])` is applied to `POST /api/escrow/deposit`
- [ ] `validateStellarAddress(['identity'])` is applied to `POST /api/escrow/release` and `/refund`
- [ ] `StellarAddress` Zod type extracted to `backend/src/schemas/stellar.ts` and used in all relevant schemas
- [ ] Submitting `"not-a-key"` as `identity` returns `400` with a field-level error message
- [ ] Submitting a valid `S…` secret key as `identity` returns `400` (rejected as not a public key)
- [ ] `escrowId` field validated to contain a Stellar address in the expected position
- [ ] All existing middleware tests still pass
- [ ] New route tests cover invalid address rejection for each affected endpoint

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain why double-validation at both the Zod schema layer and the middleware layer is valuable (defense in depth).
- Show the specific `400` response body for an invalid identity submission.
- Discuss whether `validateStellarAddress` should be replaced entirely by the Zod schema approach or retained for non-Zod use cases.
- Note whether the middleware should also validate that a submitted public key is not a known test/fixture address in production mode.
