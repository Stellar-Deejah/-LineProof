# Event Model Reference

All LineProof events are emitted by Soroban contracts and available to listeners.

## Event Contract Naming
- `lineproof.factory` — Factory lifecycle events
- `lineproof.queue` — Queue state transitions
- `lineproof.enrollment` — Enrollment state changes
- `lineproof.escrow` — Escrow state transitions
- `lineproof.identity` — Binding state changes

## Fields
All events contain at minimum:
- `kind`: string
- `queueSlug`: string
- `relatedPositionId`: number (optional)
- `identity`: string (optional)
- `timestamp`: timestamp

## Guarantees
- Events are monotonic (time-ordered by ledger).
- Events cannot be forged (cryptographic on-chain signature).
- Events are never deleted (immutable blockchain history).
