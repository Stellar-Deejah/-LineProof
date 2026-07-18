# Contract Storage TTL

## Overview

On Soroban, persistent storage entries have a **time-to-live (TTL)**. When an
entry's TTL lapses and is not extended, the entry is archived and reads behave as
if the data were never written. LineProof contracts store queue config, positions,
enrollment counts, identity bindings, and escrow records in persistent storage.

All LineProof contracts now implement automatic TTL extension to prevent silent
data loss.

## TTL Model

### extend_ttl() Semantics

Soroban's `env.storage().persistent().extend_ttl(&key, threshold, extend_to)` works as follows:

- **threshold**: If the entry's remaining TTL is below this value (in ledgers), the TTL is extended
- **extend_to**: The target TTL value (in ledgers) to extend to when the threshold is met
- If remaining TTL >= threshold: no extension occurs (gas-efficient)
- If remaining TTL < threshold: TTL is set to `current_ledger + extend_to`

### Ledger Math

At 5 seconds per ledger (typical Soroban mainnet):
- 10,000 ledgers ≈ 13.8 hours
- 86,400 ledgers ≈ 5 days
- 6,307,200 ledgers ≈ 1 year

## TTL Constants

All contracts use the following TTL constants:

```rust
/// TTL threshold: renew if remaining TTL is below this many ledgers (~13.8 hours at 5s/ledger)
const TTL_THRESHOLD: u32 = 10_000;
/// TTL extension target: extend to this many ledgers (~1 year at 5s/ledger)
const TTL_EXTEND_TO: u32 = 6_307_200;
```

The escrow contract adds an additional buffer:

```rust
/// Additional TTL buffer for escrow records beyond hold_period_days (in ledgers)
const ESCROW_TTL_BUFFER: u32 = 86_400; // ~5 days at 5s/ledger
```

## Implementation Strategy

### Defense-in-Depth: Write + Read Extension

TTL extension is applied in two places:

1. **Write path**: After every `storage().persistent().set()` call
2. **Read path**: After every `storage().persistent().get()` call (touch-on-read pattern)

This ensures:
- Data is protected immediately when written
- Frequently-accessed data stays alive
- Infrequently-accessed data is refreshed when needed

### Contract Instance TTL

Each contract's `initialize()` function extends the contract instance TTL:

```rust
env.storage().persistent().extend_ttl(&env.current_contract_address(), TTL_THRESHOLD, TTL_EXTEND_TO);
```

This ensures the contract code itself remains accessible.

## Per-Contract Storage Keys

### lineproof-queue

- `config` - QueueConfig (extended on read/write)
- `next_id` - Next position ID counter (extended on read/write)
- `idx` - Advancement cursor (extended on read/write)
- `("pos", position_id)` - Position records (extended on read/write)

### lineproof-enrollment

- `("enrollment", queue_id, identity)` - EnrollmentRecord (extended on read/write)
- `dup_behavior` - DuplicateBehavior config (extended on read/write)

### lineproof-escrow

- `("escrow", queue_id, identity)` - EscrowRecord (extended on read/write)
- `("escrow_config", queue_id)` - EscrowConfig (extended on read/write)
- `("escrow_total", queue_id)` - Running total held (extended on read/write)

### lineproof-identity

- `("identity", identity)` - IdentityRecord (extended on read/write)
- `admin` - Admin address (extended on read/write)
- `("attempt", from, to, queue_id)` - TransferAttempt (extended on read/write)

### lineproof-queue-factory

- `config` - FactoryConfig (extended on read/write)
- `slug_idx` - List of registered slugs (extended on read/write)
- `("queue", slug)` - QueueMetadata (extended on read/write)

## Escrow Hold Period Considerations

Escrow records with long hold periods (e.g., 90 days) require special attention:

- The TTL extension target (1 year) exceeds typical hold periods
- The `ESCROW_TTL_BUFFER` provides additional safety margin
- Touch-on-read ensures escrow records accessed during the hold period stay alive

## Testing

TTL extension is verified through:

1. Unit tests that mock storage and verify `extend_ttl` is called
2. Integration tests that simulate ledger progression using `env.ledger().set_sequence()`
3. All existing contract tests continue to pass with TTL extension added

## Related

- Advancement behaviour affected by expiry: [docs/vrf-advancement.md](vrf-advancement.md)
- Event-based history reconstruction: [docs/event-model.md](event-model.md)
- Architecture overview: [ARCHITECTURE.md](../ARCHITECTURE.md)
