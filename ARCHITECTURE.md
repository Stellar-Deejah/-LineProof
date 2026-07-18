# Architecture

LineProof is organized as a Soroban protocol with TypeScript integration tooling and reference applications. The contracts own fairness-critical state. The SDK, backend, frontend, and examples make that state usable but should not be trusted as the source of truth.

## Goals

- Make queue membership and advancement independently auditable.
- Bind queue positions to identities so positions cannot be sold as transferable assets.
- Keep escrow release and refund rules explicit.
- Provide a narrow SDK surface for applications that need to deploy, enroll, advance, and audit queues.
- Separate current implementation from future governance, identity, and randomness work.

## Repository Boundaries

| Directory | Responsibility |
|-----------|----------------|
| `contracts/` | Soroban contract workspace and protocol state machines. |
| `sdk/` | TypeScript client package for contract invocation, query helpers, and typed domain models. |
| `backend/` | Reference API for operators that need indexing, notifications, or integration adapters. |
| `frontend/` | Reference UI for browsing queues and participant status. |
| `examples/` | Runnable integration sketches for target domains. |
| `docs/` | Maintainer and integrator documentation. |
| `research/` | Domain research that informs product and protocol design. |

## Contract Architecture

### `lineproof-queue-factory`

Deploys or registers queue instances, records queue metadata, and provides a version boundary for compatible queue implementations. The factory is the entry point operators should publish when they want users to verify that a queue was created from a known LineProof release.

### `lineproof-queue`

Owns queue configuration, lifecycle state, position records, and advancement progress. It enforces the legal state transitions described in [docs/queue-lifecycle.md](docs/queue-lifecycle.md).

### `lineproof-enrollment`

Creates enrollment records and prevents duplicate enrollment for the same identity within a queue. Enrollment records should be treated as the canonical participant set for audit reconstruction.

### `lineproof-identity`

Stores identity bindings used by queue and enrollment logic. The initial model binds positions to Stellar accounts. Stronger identity providers can be integrated later through commitments or attestations, but raw personal data should not be written on-chain.

### `lineproof-escrow`

Stores payment holds associated with queue participation. Escrow records move through `Active`, `Released`, `Refunded`, or `Expired` states. See [docs/escrow-model.md](docs/escrow-model.md).

## Runtime Flow

```
operator
  |
  | deploy/register queue
  v
queue factory ---- records queue metadata and implementation version
  |
  v
queue contract ---- owns lifecycle, position status, and advancement cursor
  |
  +--> enrollment contract ---- records participant enrollment proof
  |
  +--> identity contract ------ checks binding and non-transferability
  |
  +--> escrow contract -------- holds, releases, refunds, or expires deposits
```

## SDK Architecture

The SDK is intentionally thin. It should:

- Convert application inputs into typed contract calls.
- Normalize contract responses into domain types.
- Provide query helpers for queue, enrollment, identity, and escrow state.
- Avoid hiding protocol-critical behavior behind off-chain assumptions.

Detailed SDK guidance is in [docs/sdk-architecture.md](docs/sdk-architecture.md).

## Backend and Frontend Roles

The backend and frontend are reference applications. They may cache data, index events, provide notifications, or expose operator-friendly views, but they do not define fairness. When UI or API state disagrees with contract state, contract state wins.

## Event and Audit Model

Every fairness-relevant transition should emit a structured event:

- Queue creation and lifecycle transitions.
- Enrollment and cancellation.
- Position advancement.
- Escrow deposit, release, refund, and expiry.
- Identity binding and rejected transfer attempts.

Auditors should be able to rebuild queue history from contract storage and events.

## Storage TTL Management

All contracts implement automatic TTL (time-to-live) extension for persistent storage entries to prevent silent data loss on Soroban. This is critical because:

- Persistent storage entries are archived when their TTL expires
- Without extension, queue positions, enrollment records, escrow data, and identity bindings would disappear
- This would undermine auditability and cause silent protocol failures

The implementation uses a defense-in-depth strategy:

1. **Write path**: `extend_ttl()` is called after every `storage().persistent().set()`
2. **Read path**: `extend_ttl()` is called after `storage().persistent().get()` (touch-on-read pattern)
3. **Contract instance**: `initialize()` functions extend the contract instance TTL

TTL constants:
- `TTL_THRESHOLD = 10_000` (~13.8 hours at 5s/ledger) - renew if TTL below this
- `TTL_EXTEND_TO = 6_307_200` (~1 year at 5s/ledger) - target TTL when renewing

See [docs/contract-storage-ttl.md](docs/contract-storage-ttl.md) for detailed documentation.

## Security Boundaries

- Contract authorization gates privileged operations.
- Frontend and backend code are untrusted conveniences.
- SDK methods must not imply guarantees that contracts do not enforce.
- Admin keys are high-value assets and should move toward multisig governance before production use.
- Personal data must remain off-chain; on-chain values should be identifiers, hashes, or commitments.

## Known Architecture Gaps

- Production identity verification is not complete.
- Event indexing and pagination need hardening for large queues.
- Multisig or DAO-controlled upgrades are planned but not implemented.
- Verifiable randomness and weighted priority queues are roadmap items.
- End-to-end deployment automation needs testnet and mainnet runbooks.
