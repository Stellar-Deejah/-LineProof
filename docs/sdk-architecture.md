# SDK Architecture

The TypeScript SDK gives integrators a typed way to work with LineProof contracts. It should remain a thin protocol client, not a hidden policy engine.

## Package Layout

| File | Responsibility |
|------|----------------|
| `sdk/src/client.ts` | Shared network, RPC, signing, and contract invocation configuration. |
| `sdk/src/queue.ts` | Queue creation, lifecycle transitions, advancement, and position queries. |
| `sdk/src/enrollment.ts` | Enrollment calls and enrollment proof helpers. |
| `sdk/src/identity.ts` | Identity binding and transfer eligibility checks. |
| `sdk/src/escrow.ts` | Deposit, release, refund, expiry, and escrow record queries. |
| `sdk/src/types.ts` | Public domain types and enums. |
| `sdk/src/index.ts` | Public exports. |

## Design Principles

- Contract state is authoritative.
- SDK methods should map closely to contract entry points.
- Public types should use descriptive names and avoid abbreviations.
- Methods that perform writes should make authorization requirements obvious.
- Query helpers may combine multiple reads, but must document derived values.
- SDK errors should preserve enough context to debug failed contract calls.

## Client Layers

```
application code
      |
      v
domain clients: QueueClient, EnrollmentClient, IdentityClient, EscrowClient
      |
      v
LineProofClient shared transport and signer configuration
      |
      v
Soroban RPC and contract invocations
```

## Current Scope

The SDK scaffold defines the intended client surface and type model. Maintainers should treat methods as integration contracts and update `docs/api-reference/sdk.md` whenever public signatures change.

## Transport: Horizon.Server vs SorobanRpc.Server

The SDK currently constructs a **single** `Horizon.Server` in
[`sdk/src/client.ts`](../sdk/src/client.ts) and uses it for everything. This is a
known limitation, because Horizon and Soroban RPC are two different servers with
two different jobs:

| Server | Package export | What it does | Used by |
|--------|----------------|--------------|---------|
| `Horizon.Server` | `@stellar/stellar-sdk` → `Horizon` | Classic Stellar network access: `loadAccount()`, transaction submission, account/sequence data. | Everything today (account load + `submitTransaction`). |
| `SorobanRpc.Server` | `@stellar/stellar-sdk` → `SorobanRpc` (a.k.a. `rpc.Server`) | Soroban smart-contract access: `simulateTransaction()`, `getEvents()`, ledger-entry (contract storage) reads. | **Nothing yet** — required for all contract *reads*. |

Why both are needed:

- **Writes** (enroll, advance, deposit, …) build a transaction, sign it, and
  submit it. `Horizon.Server.submitTransaction()` handles this.
- **Reads** of contract state (`isEnrolled`, `getPosition`, `isBound`, escrow
  records, events) require **simulating** a contract call or reading a ledger
  entry. Horizon cannot do this; it has no view into contract storage. Only
  `SorobanRpc.Server` can, via `simulateTransaction()` / `getLedgerEntries()` /
  `getEvents()`.

Because the read path does not exist, the read methods below throw at runtime
instead of returning data.

### NOT_IMPLEMENTED methods

These methods parse/validate arguments but then throw
`SDKError('NOT_IMPLEMENTED', …)` because they need the `SorobanRpc.Server` read
path that is not wired yet:

| Method | File | Throws | Tracking issue |
|--------|------|--------|----------------|
| `EnrollmentClient.isEnrolled()` | [`sdk/src/enrollment.ts`](../sdk/src/enrollment.ts) | `NOT_IMPLEMENTED` | [#14](https://github.com/Stellar-Deejah/-LineProof/issues/14) |
| `QueueClient.getPosition()` | [`sdk/src/queue.ts`](../sdk/src/queue.ts) | `NOT_IMPLEMENTED` (after `INVALID_INPUT` guard) | [#14](https://github.com/Stellar-Deejah/-LineProof/issues/14) |
| `IdentityClient.isBound()` | [`sdk/src/identity.ts`](../sdk/src/identity.ts) | `NOT_IMPLEMENTED` | [#14](https://github.com/Stellar-Deejah/-LineProof/issues/14) |

`IdentityClient.recordTransferAttempt()` also throws, but deliberately
(`TRANSFER_DISABLED`) — non-transferability is a protocol invariant, not a
missing feature.

## Known Issues

SDK integrators should be aware of these before building against the current
scaffold, so they are not discovered at runtime:

| Issue | Summary | Where it bites |
|-------|---------|----------------|
| [#11](https://github.com/Stellar-Deejah/-LineProof/issues/11) | Every transaction method calls `Keypair.fromSecret(this.client.getPublicKey())` — `getPublicKey()` returns a **public** key, so `fromSecret()` throws immediately. | `enroll`, `cancel`, `advance`, `close`, `deposit`, `release`, `refund`, `bindIdentity` all fail before submission. Signing must use the configured `privateKey`. |
| [#25](https://github.com/Stellar-Deejah/-LineProof/issues/25) | `LineProofClient.deployFactory()` returns a **fabricated** contract ID (`'C' + random pubkey.slice(1)`), not a deployed contract. | Any code that persists or calls the returned ID will fail; treat it as non-authoritative. |
| [#8](https://github.com/Stellar-Deejah/-LineProof/issues/8) | No frontend UI for enrollment cancellation, escrow management, or post-enrollment status. | SDK consumers building a UI cannot rely on a reference implementation for these flows. |
| [#22](https://github.com/Stellar-Deejah/-LineProof/issues/22) | Accessibility gaps in the reference frontend (`Tooltip` missing `aria-describedby`, no live regions on form errors). | Teams reusing the reference components inherit the a11y gaps. |

## Planned config split: `sorobanRpcUrl`

Today `LineProofConfig.rpcServerUrl` is passed to `Horizon.Server` after the SDK
strips any `/rpc…` suffix (`resolved.rpcServerUrl.replace(/\/rpc.*/, '')`). This
conflates two endpoints. The planned change adds a **separate**
`sorobanRpcUrl` field:

- `rpcServerUrl` → keeps feeding `Horizon.Server` (account load, submit).
- `sorobanRpcUrl` → feeds a new `SorobanRpc.Server` (reads, simulate, events).

The split is additive: `sorobanRpcUrl` defaults from the network when omitted, so
existing configs keep working, and the read methods above can be implemented
without changing the write path. Tracked by
[#9](https://github.com/Stellar-Deejah/-LineProof/issues/9).

## Future Work

- Add generated bindings from compiled Soroban contract specs.
- Add pagination helpers for queue and event reads.
- Add typed event decoding.
- Add browser-safe and Node-safe signer adapters.
- Add integration tests against localnet.
