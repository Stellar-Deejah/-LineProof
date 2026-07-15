# [Bug] All SDK transaction-building methods pass a public key to `Keypair.fromSecret()` — will throw at runtime

**Labels:** `bug`, `sdk`, `security`
**Difficulty:** Expert

---

## Problem

Every method in the SDK that builds a Soroban transaction calls `Keypair.fromSecret(this.client.getPublicKey())`. `getPublicKey()` returns a Stellar public key starting with `G…`. Passing a public key to `Keypair.fromSecret()` throws a `TypeError` because `fromSecret` expects a Stellar secret key starting with `S…`. This means **no transaction can ever be submitted** via the SDK.

The affected methods and files are:

- `sdk/src/enrollment.ts` — `EnrollmentClient.enroll()` and `EnrollmentClient.cancel()`
- `sdk/src/escrow.ts` — `EscrowClient.deposit()`, `EscrowClient.release()`, `EscrowClient.refund()`
- `sdk/src/queue.ts` — `QueueClient.advance()` and `QueueClient.close()`
- `sdk/src/identity.ts` — `IdentityClient.bindIdentity()`

The root cause is that `LineProofClient` stores the secret key as `private readonly sourceSecret?: string` but exposes only `getPublicKey()`. There is no `getPrivateKey()` or package-internal accessor for the secret. All transaction builders independently re-derive the keypair from the secret, but mistakenly call `getPublicKey()` instead of accessing `sourceSecret`.

**Secondary issue — `EscrowClient` missing `expire()` method:**
`sdk/src/escrow.ts` exposes `deposit`, `release`, and `refund` but has no `expire()` method, even though `lineproof-escrow/src/lib.rs` exposes `expire` as a callable contract function. This leaves the expiry lifecycle entirely unreachable from the SDK.

**Impact:** The SDK is the primary integration surface for operators building on LineProof. Every transaction call silently fails at runtime with a cryptic key-format error. The `sdk/tests/sdk.test.ts` mock intercepts `Keypair.fromSecret` so the tests pass despite the bug — it is invisible in the test suite.

---

## Proposed Solution

**Fix the credential access pattern:**
- Add a package-internal (non-exported) `requireKeypair(): Keypair` method to `LineProofClient` that:
  1. Throws `SDKError('MISSING_CREDENTIALS', ...)` if `sourceSecret` is undefined.
  2. Returns `Keypair.fromSecret(this.sourceSecret)` when set.
- Replace every `Keypair.fromSecret(this.client.getPublicKey())` call across `enrollment.ts`, `escrow.ts`, `queue.ts`, and `identity.ts` with `this.client.requireKeypair()`.
- Keep `getPublicKey()` for read-only use cases that do not require signing.

**Add `EscrowClient.expire()`:**
- Add an `expire(escrowContractId: string, identity: string): Promise<string>` method to `EscrowClient` following the same pattern as `release()`, passing `"expire"` as the contract function name and the identity address as an argument.

**Harden tests:**
- Add a test case that verifies the `SDKError('MISSING_CREDENTIALS')` is thrown when no private key is configured — specifically for `enroll`, `cancel`, `advance`, `close`, `bindIdentity`, `deposit`, `release`, `refund`, and `expire`.
- Add a test that verifies no call to `Keypair.fromSecret` receives a `G…`-prefixed string.

---

## Acceptance Criteria

- [ ] `LineProofClient` exposes a package-internal `requireKeypair()` that throws `SDKError('MISSING_CREDENTIALS')` when `sourceSecret` is absent
- [ ] `EnrollmentClient.enroll()` and `cancel()` use `requireKeypair()`
- [ ] `EscrowClient.deposit()`, `release()`, and `refund()` use `requireKeypair()`
- [ ] `QueueClient.advance()` and `close()` use `requireKeypair()`
- [ ] `IdentityClient.bindIdentity()` uses `requireKeypair()`
- [ ] `EscrowClient.expire()` is implemented and tested
- [ ] No test mocks `Keypair.fromSecret` in a way that hides the public-key-as-secret bug
- [ ] `pnpm test` in `sdk/` passes with all new tests green
- [ ] No TypeScript `any` casts introduced
- [ ] `sdk/src/client.ts` does not export `sourceSecret` — access is internal only

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain the exact error message a caller would see when `Keypair.fromSecret` is called with a public key.
- Describe why the unit tests did not catch this (mock intercepts `fromSecret` before the bad argument is validated).
- Show the `pnpm test` output before and after the fix.
- Discuss whether `requireKeypair()` should be a `Symbol`-keyed internal method or simply package-private by convention (TypeScript visibility limitations).
- Include a screenshot or log of a successful local transaction simulation after the fix if possible.
