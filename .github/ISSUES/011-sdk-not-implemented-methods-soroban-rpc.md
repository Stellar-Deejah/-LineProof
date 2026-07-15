# [Enhancement] Implement `isEnrolled`, `getPosition`, and `isBound` via Soroban RPC client binding

**Labels:** `sdk`, `enhancement`, `api`
**Difficulty:** Expert

---

## Problem

Three read methods in the SDK are permanently stubbed and throw `NOT_IMPLEMENTED`, making it impossible for any consumer to query on-chain state:

1. **`EnrollmentClient.isEnrolled()` — `sdk/src/enrollment.ts`**
   Throws `SDKError('NOT_IMPLEMENTED', 'isEnrolled requires a bound contract client exposing Soroban RPC')`. The underlying contract function `is_enrolled(env, identity, queue_id) -> bool` is fully implemented and tested in `lineproof-enrollment/src/lib.rs`. The SDK has no wiring to read-only contract invocation at all.

2. **`QueueClient.getPosition()` — `sdk/src/queue.ts`**
   Throws `SDKError('NOT_IMPLEMENTED', 'getPosition requires a bound contract client exposing Soroban RPC')`. The contract's `get_position(env, position_id) -> Option<Position>` is fully implemented and tested in `lineproof-queue/src/lib.rs`. Additionally, `QueueClient.advance()` parses `parseInt(result.hash.slice(0, 8), 16)` as the return value — this is incorrect; Soroban contract return values come from the `result_xdr` field in the transaction result, not the transaction hash.

3. **`IdentityClient.isBound()` — `sdk/src/identity.ts`**
   Throws `SDKError('NOT_IMPLEMENTED', 'isBound requires Soroban RPC contract client')`. The contract's `is_bound(env, identity, queue_id) -> bool` is fully implemented in `lineproof-identity/src/lib.rs`.

**Secondary issue — `LineProofClient` uses `Horizon.Server` for read queries:**
The `LineProofClient` constructor creates a `Horizon.Server` instance from `rpcServerUrl` (stripping the `/rpc` suffix). Soroban contract state reads require the **Soroban RPC** endpoint, not the Horizon REST API. Horizon does not expose contract storage. All read operations that need to call `simulateTransaction` or `getLedgerEntry` must use `SorobanRpc.Server` from `@stellar/stellar-sdk`.

**Impact:** The SDK cannot be used for any read-only use case — not for a UI displaying enrollment status, not for an auditor checking position state, and not for an operator script checking binding status before advancing a queue.

---

## Proposed Solution

**Introduce `SorobanRpcClient` wrapper:**
- Add `SorobanRpc.Server` (from `@stellar/stellar-sdk`) alongside `Horizon.Server` in `LineProofClient`.
- Expose a `simulateContractCall(contractId, functionName, args)` method that calls `SorobanRpc.Server.simulateTransaction()` and deserializes the `xdr.ScVal` return value.
- Add a `getContractStorageEntry(contractId, key)` method for direct storage reads where available.

**Implement the three read methods:**
- `EnrollmentClient.isEnrolled(queueId, identity)`: Build a `simulateTransaction` for `is_enrolled` with the identity address and queue Symbol as arguments, deserialize the `Bool` return value.
- `QueueClient.getPosition(positionId)`: Build a `simulateTransaction` for `get_position`, deserialize the `Option<Position>` XDR into the TypeScript `Position` type from `sdk/src/types.ts`.
- `IdentityClient.isBound(queueId, identity)`: Build a `simulateTransaction` for `is_bound`, deserialize the `Bool` return value.

**Fix `advance()` return value parsing:**
- Replace `parseInt(result.hash.slice(0, 8), 16)` with proper `xdr.ScVal` deserialization of the transaction result to get the actual advanced position IDs.

---

## Acceptance Criteria

- [ ] `LineProofClient` initializes both `Horizon.Server` and `SorobanRpc.Server`
- [ ] `simulateContractCall` helper correctly calls `simulateTransaction` and returns the deserialized value
- [ ] `EnrollmentClient.isEnrolled()` no longer throws `NOT_IMPLEMENTED`
- [ ] `QueueClient.getPosition()` no longer throws `NOT_IMPLEMENTED`
- [ ] `IdentityClient.isBound()` no longer throws `NOT_IMPLEMENTED`
- [ ] `QueueClient.advance()` parses the contract return value from `result_xdr`, not the transaction hash
- [ ] Return types match the TypeScript types in `sdk/src/types.ts` (e.g., `Position`, `EnrollmentRecord`)
- [ ] Unit tests use mocked `SorobanRpc.Server.simulateTransaction` — no real network calls
- [ ] `pnpm test` in `sdk/` passes with all tests green
- [ ] `sdk/src/client.ts` updated with `sorobanRpcUrl` config option documented in `LineProofConfig`

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain the difference between `Horizon.Server` and `SorobanRpc.Server` and why read operations require the latter.
- Show the XDR deserialization strategy used for `Option<Position>` (handle `ScVal.scvVoid` for `None`).
- Include the mock setup for `SorobanRpc.Server.simulateTransaction` in tests.
- Discuss whether the two server instances should share the same base URL or require separate config keys.
- Note any version constraints on `@stellar/stellar-sdk` related to `SorobanRpc`.
