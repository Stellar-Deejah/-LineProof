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
| `sdk/src/types.ts` | Public domain types, config resolution (`resolveEndpoints`), and enums. |
| `sdk/src/pagination.ts` | Cursor encode/decode and the generic `paginate()` helper used by `getEvents()`. |
| `sdk/src/events.ts` | Typed contract event interfaces and `deserializeContractEvent()`. |
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

`LineProofClient` (in [`sdk/src/client.ts`](../sdk/src/client.ts)) constructs
**both** servers, because Horizon and Soroban RPC are two different servers with
two different jobs:

| Server | Package export | What it does | Used by |
|--------|----------------|--------------|---------|
| `Horizon.Server` | `@stellar/stellar-sdk` → `Horizon` | Classic Stellar network access: `loadAccount()`, transaction submission, account/sequence data. | `deployFactory()`, `IdentityClient.bindIdentity()`. |
| `SorobanRpc.Server` | `@stellar/stellar-sdk` → `SorobanRpc` (a.k.a. `rpc.Server`) | Soroban smart-contract access: `simulateTransaction()`, `getEvents()`, ledger-entry (contract storage) reads, transaction submission via `sendTransaction()`. | `submitSorobanOperation()`, `simulateContractCall()`, `getContractStorageEntry()`, `awaitTransaction()`, `getEvents()`. |

Why both are needed:

- **Writes** that go through Soroban RPC's own submission path (enroll, advance,
  deposit, release, refund, expire, close) are built and sent via
  `submitSorobanOperation()`, which uses `SorobanRpc.Server.prepareTransaction()`
  / `sendTransaction()`.
- `deployFactory()` and `IdentityClient.bindIdentity()` are the two remaining
  call sites still built and submitted through classic `Horizon.Server`.
- **Reads** of contract state (`isEnrolled`, `getPosition`, `isBound`, escrow
  records, events) simulate a contract call or read a ledger entry — Horizon
  has no view into contract storage, so these always go through
  `SorobanRpc.Server` via `simulateTransaction()` / `getLedgerEntries()` /
  `getEvents()`.

`EnrollmentClient.isEnrolled()`, `QueueClient.getPosition()`, and
`IdentityClient.isBound()` are implemented on top of
`LineProofClient.simulateContractCall()`, which drives the Soroban RPC read
path described above.

`IdentityClient.recordTransferAttempt()` throws deliberately
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

## Config: `horizonUrl` / `sorobanRpcUrl` (and the deprecated `rpcServerUrl`)

`LineProofConfig` (in [`sdk/src/types.ts`](../sdk/src/types.ts)) has separate
`horizonUrl` and `sorobanRpcUrl` fields, since Horizon and Soroban RPC are
different URLs in every real deployment (e.g.
`https://horizon-testnet.stellar.org` vs `https://soroban-testnet.stellar.org`).

The single `rpcServerUrl` field from earlier versions is kept as a **deprecated
fallback** for one release cycle, resolved by `resolveEndpoints()`:

```ts
// Old (still works, but warns once via console.warn):
new LineProofClient({
  rpcServerUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: NetworkPassphrase.TESTNET,
});

// New (no warning — explicit and correct for every real deployment):
new LineProofClient({
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: NetworkPassphrase.TESTNET,
});
```

Resolution order for each field: the split field if given, else
`rpcServerUrl` if given, else the local-dev default
(`DEFAULT_LINEPROOF_CONFIG`). `rpcServerUrl` is only treated as the
deprecated path (and only then does it warn) when *neither* `horizonUrl` nor
`sorobanRpcUrl` is supplied — so a caller who sets `sorobanRpcUrl` alone still
gets `rpcServerUrl`-based fallback for `horizonUrl` with no warning noise,
covering the common case (e.g. `backend/src/contracts/lineproofClient.ts`
today) of only ever having had a Soroban RPC URL configured. `rpcServerUrl`
will be removed in a future major version; existing consumers should migrate
to the two explicit fields when convenient.

## Event reads: `getEvents()` / `streamEvents()`

`LineProofClient.getEvents(filter)` fetches contract events from
`SorobanRpc.Server.getEvents()` and returns a `Page<AnyLineProofEvent>` (the
same `Page` shape `pagination.ts` already defined):

```ts
const page = await client.getEvents({
  contractIds: [escrowContractId],
  namespaces: ['lineproof.escrow'],
  limit: 50,
});
for (const event of page.items) { /* AnyLineProofEvent, narrowed by `.namespace`/`.kind` */ }
if (page.nextCursor) {
  const next = await client.getEvents({ ...filter, cursor: page.nextCursor });
}
```

`LineProofClient.streamEvents(filter, callback, intervalMs?)` polls `getEvents`
on an interval (default 5s), invokes `callback` for each new event, and
auto-advances the cursor. It returns an unsubscribe function. A single failed
poll does not stop the stream — it retries on the same cursor at the next
tick.

### Cursor format

`getEvents()`/`streamEvents()` use the **same** cursor as `pagination.ts`'s
`paginate()`/`encodeCursor()`/`decodeCursor()`: `base64(ledger:index)`, where
`index` is the position of the last returned item within its response batch.
`getEvents` decodes an incoming `cursor` back into a ledger number and passes
it to Soroban RPC as `startLedger` for the next fetch. This is the format
documented as the pagination contract the backend's own cursor-based
pagination (issue #021, `GET /api/queues`) is expected to match, so a client
walking backend pages and SDK event pages can share one cursor
implementation.

### Deserialization strategy (`events.ts`)

`deserializeContractEvent()` reads a raw Soroban RPC event's `topic` array
(each entry may be an already-parsed `xdr.ScVal` or a raw base64-XDR string —
both are handled) and decodes:

1. `topic[0]` → `namespace` (must be one of the five `EventNamespace` values;
   otherwise the event is dropped as not-ours).
2. `topic[1]` → `kind` (matched against a fixed switch of known
   namespace:kind pairs covering all 17 `AnyLineProofEvent` members;
   unrecognized pairs are dropped).
3. `topic[2..]` → the event-specific typed fields (e.g. `identity`, `amount`,
   `positionId`), via `scValToNative` with a same-shape fallback for raw
   base64 entries.

**Current data-availability caveat**: as of this writing, every contract's
`emit()` helper (e.g. `contracts/lineproof-escrow/src/lib.rs` `fn emit`) only
publishes a 3-part topic — `(namespace, kind, queue_id)`. Parameters like
`identity` and `amount` are accepted by `emit()` but not yet included in the
published topic. Until the contracts are updated to publish that data,
fields like `EscrowDepositedEvent.amount` will decode to their zero value
(`0n`) rather than the real deposit amount — `deserializeContractEvent` does
not fail or fabricate data; it decodes exactly what the chain actually
emitted. Callers needing that data today should still use
`simulateContractCall`-based reads (`getPosition`, `isEnrolled`, `isBound`)
until a corresponding contract-side change lands.

## Future Work

- Update contract `emit()` calls to publish identity/amount/proofHash in
  topics so `getEvents()` deserialization is fully populated (see the
  data-availability caveat above).
- Add generated bindings from compiled Soroban contract specs.
- Add browser-safe and Node-safe signer adapters.
- Add integration tests against localnet for `getEvents()`/`streamEvents()`.
