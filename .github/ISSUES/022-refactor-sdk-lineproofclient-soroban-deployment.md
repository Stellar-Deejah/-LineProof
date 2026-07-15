# [Refactor] `LineProofClient.deployFactory()` generates a fake contract ID — real Soroban deployment is unimplemented

**Labels:** `refactor`, `sdk`, `architecture`, `enhancement`
**Difficulty:** Expert

---

## Problem

Three structural problems make the SDK unusable as an actual deployment tool:

1. **`deployFactory()` generates a fake contract ID**
   `sdk/src/client.ts` — `deployFactory()` generates a pseudo-contract ID by taking `'C' + Keypair.random().publicKey().slice(1)`. This is not a valid Soroban contract deployment. No WASM is uploaded to the ledger, no contract instance is created, and the returned string will not correspond to any real contract on any network. The method exists only to satisfy the type system and the single test that checks credentials validation.

2. **No WASM upload or `installContractCode` integration**
   A real Soroban contract deployment requires two steps: `installContractCode` (upload the WASM blob and get a `wasm_hash`) and `createContract` (instantiate from the hash). The SDK has no method for either. There is no `uploadWasm(wasmBytes: Uint8Array): Promise<string>` method, no `installContract` wrapper, and no mechanism to wire the correct WASM for each LineProof contract.

3. **`QueueClient` is initialized with a `queueContractId` string but has no verification that the contract exists on-chain**
   `sdk/src/queue.ts` — `QueueClient` accepts any string as `queueContractId`. It does not validate the contract ID format (must be a valid Stellar contract address starting with `C…`), does not verify the contract exists on the configured network, and does not check that it exposes the expected `Queue` interface before building transactions against it.

**Impact:** Any operator using the SDK to deploy LineProof contracts will produce invalid contract IDs. Any downstream code that stores and uses the returned ID will silently fail at transaction submission time. The SDK cannot be used for its primary purpose — deploying a queue to Stellar testnet or mainnet.

---

## Proposed Solution

**Real WASM deployment:**
- Add `uploadWasm(wasmBytes: Uint8Array): Promise<string>` to `LineProofClient` that builds and submits an `Operation.uploadContractWasm` transaction and returns the resulting `wasm_hash` bytes.
- Add `installContract(wasmHash: string, constructorArgs?: xdr.ScVal[]): Promise<string>` that builds and submits an `Operation.createCustomContract` transaction and returns the new contract ID.
- Add `deployQueue(params: QueueDeploymentParams): Promise<string>` that composes `uploadWasm` + `installContract` for the queue WASM and calls the contract's `initialize()` function.

**WASM bundle management:**
- Create `sdk/src/wasm/` directory with pre-built WASM blobs for each contract (or a function to load them from a configurable path).
- Export `QUEUE_WASM_PATH`, `ENROLLMENT_WASM_PATH`, `ESCROW_WASM_PATH`, `IDENTITY_WASM_PATH`, `FACTORY_WASM_PATH` constants.

**Contract ID validation:**
- Add `validateContractId(id: string): void` in `sdk/src/types.ts` that checks the ID is a valid Stellar contract address (starts with `C`, correct length, valid StrKey).
- Call this in `QueueClient`, `EnrollmentClient`, `EscrowClient`, and `IdentityClient` constructors.

---

## Acceptance Criteria

- [ ] `LineProofClient.uploadWasm(wasmBytes)` builds and submits a real `uploadContractWasm` operation
- [ ] `LineProofClient.installContract(wasmHash, args)` builds and submits a real `createCustomContract` operation
- [ ] `LineProofClient.deployFactory()` replaced with a real two-step upload + install deployment
- [ ] `validateContractId(id)` throws `SDKError('INVALID_CONTRACT_ID', ...)` for non-`C…` strings
- [ ] `QueueClient`, `EnrollmentClient`, `EscrowClient`, `IdentityClient` constructors call `validateContractId`
- [ ] `sdk/src/wasm/` directory created with README explaining how to populate WASM blobs from a contract build
- [ ] `LineProofConfig` extended with optional `wasmDir?: string` to support custom WASM paths
- [ ] Unit tests mock the WASM upload and contract creation operations — no real network calls
- [ ] `pnpm test` in `sdk/` passes with all new and existing tests green
- [ ] `deployQueue()` end-to-end tested against Stellar testnet in a separate integration test (skipped in CI unless `INTEGRATION=true` env var is set)

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain the two-step Soroban deployment process (upload WASM → instantiate contract) and how the SDK abstracts it.
- Show the `Operation.uploadContractWasm` and `Operation.createCustomContract` call signatures from `@stellar/stellar-sdk`.
- Describe the strategy for bundling WASM blobs in the SDK package (check-in compiled blobs vs. build-time generation vs. user-provided path).
- Include a testnet deployment log showing a successfully deployed queue factory contract ID.
- Note any version constraints on `@stellar/stellar-sdk` for `uploadContractWasm` and `createCustomContract`.
