# Queue Lifecycle

This document defines the canonical queue lifecycle for LineProof. Contract code, SDK methods, backend routes, frontend labels, and docs should use these state names consistently.

## States

| State | Purpose | Allowed participant action | Allowed operator action |
|-------|---------|----------------------------|-------------------------|
| `Draft` | Queue exists but is not accepting enrollment. | None. | Update pre-launch configuration if supported by the contract version. |
| `EnrollmentOpen` | Participants can join the queue. | Enroll, deposit escrow if required, inspect status. | Monitor enrollments and close enrollment. |
| `EnrollmentClosed` | Participant set is locked. | Inspect status and escrow record. | Begin advancement or cancel according to policy. |
| `AdvancementActive` | Positions are being served. | Inspect status, claim service when advanced, request refund where policy allows. | Advance batches and release or refund escrow. |
| `Closed` | Queue is finalized. | Inspect final audit trail. | No normal state transitions. |

## State Transitions

```
Draft
  |
  | open_enrollment  (only permitted from Draft)
  v
EnrollmentOpen
  |
  | close_enrollment  (only permitted from EnrollmentOpen)
  v
EnrollmentClosed
  |
  | advance  (permitted from EnrollmentClosed or AdvancementActive)
  v
AdvancementActive
  |
  | close  (permitted from any non-Closed state)
  v
Closed
```

```
                     ┌─────────────────────────────────────────────────┐
                     │                                                 │
                     │   x  reopen (open_enrollment) — REJECTED        │
                     │                                                 │
        ┌────────────┼─────────────────┬───────────────────┐          │
        │            │                 │                   │          │
        v            x                 x                   x          │
     Draft ──────> EnrollmentOpen ──> EnrollmentClosed ──> AdvancementActive
        │  open_        │  close_          │  advance          │  advance
        │  enrollment    │  enrollment       │                   │  (loops)
        │                │                   │                   │
        │  x close_enrollment (REJECTED — no open_enrollment yet)│
        │                │                   │                   │
        └────────────────┴───────────────────┴───────────────────┘
                                     │  close (from any non-Closed state)
                                     v
                                  Closed
                                     │
                                     x  close (REJECTED — already Closed)
                                     x  open_enrollment (REJECTED)
                                     x  close_enrollment (REJECTED)
```

`x` marks a transition that is now explicitly rejected (panics) by the guards below. Solid `│`/`v` arrows are the only paths a queue can actually move through.

The contract enforces these transitions strictly — every transition function guards on the state(s) it is allowed to run from and panics otherwise:

| Function | Permitted from | Panics from | Panic message |
|----------|-----------------|--------------|----------------|
| `open_enrollment` | `Draft` | `EnrollmentOpen`, `EnrollmentClosed`, `AdvancementActive`, `Closed` | `"enrollment can only be opened from draft state"` |
| `close_enrollment` | `EnrollmentOpen` | `Draft`, `EnrollmentClosed`, `AdvancementActive`, `Closed` | `"enrollment can only be closed from enrollment_open state"` |
| `advance` | `EnrollmentClosed`, `AdvancementActive` | `Draft`, `EnrollmentOpen`, `Closed` | `"enrollment must be closed before advancing"` (or `"queue is closed"` from `Closed`) |
| `close` | `Draft`, `EnrollmentOpen`, `EnrollmentClosed`, `AdvancementActive` (any non-`Closed` state) | `Closed` | `"queue is closed"` |

### Rejected transitions (previously allowed, now guarded)

Before this state machine was enforced, `open_enrollment()` only rejected a call when the queue was already `EnrollmentOpen` or `Closed`, and `close_enrollment()` had no guard at all. That allowed lifecycle reversals such as:

- Reopening a `Closed` queue back to `EnrollmentOpen`.
- Reopening a queue that had already progressed to `AdvancementActive`, reversing an in-progress advancement.
- Closing enrollment on a `Draft` queue that was never opened, silently skipping the enrollment window.

These are now rejected with a panic, and are covered by dedicated tests (`test_reopen_closed_queue_panics`, `test_reopen_advancement_active_panics`, `test_close_enrollment_from_draft_panics`, `test_close_enrollment_twice_panics` in `contracts/lineproof-queue/src/test.rs`).

### Why `close()` allows any non-`Closed` state

`close()` is treated as an operator-initiated finalization / emergency-stop, not strictly the terminal step after `AdvancementActive`. Restricting it to `AdvancementActive` only would prevent an operator from shutting down a queue that was misconfigured in `Draft`, or that needs to be aborted while still accepting enrollment. The only invariant `close()` enforces is that `Closed` is terminal — a queue cannot be closed twice, matching the "Closed is terminal" invariant below.

Cancellation paths should be explicit in the contract version that supports them. If a queue is cancelled after escrow deposits exist, each active escrow record must have a refund or expiry path.

## Enrollment Rules

- Enrollment is only valid in `EnrollmentOpen`.
- A queue must reject enrollment after `EnrollmentClosed`.
- Each identity can hold at most one active position per queue.
- The queue must not exceed `maxPositions`.
- If escrow is required, the participant must satisfy escrow requirements before the position is considered serviceable.

## Advancement Rules

The initial implementation focuses on first-in-first-out advancement. Future implementations may support priority tiers or verifiable randomness, but those modes must publish their ordering inputs before enrollment closes.

Advancement must preserve these invariants:

- A position cannot advance before it exists.
- A position cannot advance twice.
- A cancelled, expired, or refunded position cannot be treated as served.
- Batch advancement must be bounded to avoid unbounded storage work.
- Advancement events must identify the queue and position IDs affected.

## Queue State Invariants

- `Closed` is terminal.
- The enrollment count cannot exceed queue capacity.
- The advancement cursor cannot move beyond the number of enrolled positions.
- Position IDs are unique within a queue.
- Events must be sufficient to reconstruct the state transition history.

## Expiry Flow

Once the queue is in `AdvancementActive` or `Closed` state, the admin may expire pending positions that were never advanced. This is useful when the enrollment close timestamp has passed and certain positions should no longer be eligible for service.

### Functions

- `expire_position(env, admin, position_id)` — expire a single pending position.
- `expire_positions_batch(env, admin, position_ids)` — expire multiple pending positions in one call.

Both functions:
- Require admin authorization.
- Panic if the queue is not in `AdvancementActive` or `Closed` state.
- Panic if the position is not in `Pending` status.
- Transition the position to `Expired` and emit an `Expired` event.

### Effect on Advancement

During FIFO advancement, `advance()` skips positions that are not `Pending` (including `Expired`, `Cancelled`, and already `Advanced` positions). Expiring stale positions allows the advancement cursor to make progress through only the eligible slots.

### Effect on total_enrolled

Expired positions **do not** decrement `total_enrolled()`. The `total_enrolled` counter tracks all position IDs ever assigned (based on the `next_id` counter) and is unaffected by status transitions. Operators should use `get_position()` to check individual position statuses rather than relying on `total_enrolled` as a count of active participants.

### When to Expire

Operators should call `expire_position` (or the batch variant) after the enrollment close deadline has passed and a position holder has not been serviced. There is currently no auto-expiry mechanism tied to the `enrollment_close` timestamp; the decision to expire is always an explicit admin action. A future iteration may add automatic time-based expiry, at which point expired positions could be distinguished from active pending positions automatically.

### Audit Trail

Each expired position emits a `lineproof_queue` event with kind `Expired` and the `position_id`, providing an on-chain record that can be used to reconstruct the queue's final state.

## Failure Handling

If an advancement transaction fails, no partial state should be considered final unless the contract has explicitly emitted the relevant events and committed storage updates. Integrators should treat transaction success, storage state, and emitted events as the source of truth.

If an operator becomes unavailable, participants with active escrow should have a defined expiry or refund route in the escrow contract version used by the queue.
