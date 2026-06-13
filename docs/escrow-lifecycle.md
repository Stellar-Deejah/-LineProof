# Escrow Lifecycle

## States
- `Active`: Deposit held in escrow.
- `Released`: Funds transferred to queue administrator.
- `Refunded`: Deposit returned to participant.
- `Expired`: Time-lock elapsed for recovery.

## State Transitions
- `deposit`: External → Active
- `release`: Active → Released (admin action)
- `refund`: Active → Refunded (admin action)
- `expire`: Active → Expired (after hold period)

## Event Coverage
Every state transition emits a `lineproof.escrow.*` event caller-verifiable on-chain.
