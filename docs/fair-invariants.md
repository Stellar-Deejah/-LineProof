# Fair Invariants of the LineProof Protocol

This document formally describes the safety, liveness, and fairness properties that the LineProof protocol **guarantees on-chain**. Unlike policy-based systems, these invariants are enforced by Soroban smart contracts and are verifiable by any independent auditor.

---

## 1. Definitions

| Term | Definition |
|------|------------|
| **Queue Position** | A non-transferable capability assigned to an identity for a specific queue instance. |
| **Enrollment** | The act of binding an identity to a queue slot before the enrollment window closes. |
| **Advancement** | The protocol-controlled transition of pending positions to `Advanced`. |
| **Escrow** | A value-bearing record held by the contract, subject to deterministic release or refund rules. |
| **Factory** | An administrative contract that deploys, registers, and versions queue instances. |

---

## 2. Safety Invariants ("Nothing Bad Happens")

### INV-1: No Transfer After Assignment

Once a position is assigned to an identity, it **cannot be transferred** to another identity.

*Proof Sketch:*  
`Identity::can_transfer(from, to, queueId)` returns `false` unless `from == to`. Any attempt to invoke a transfer for a bound position reverts via the explicit `fail_with` in the caller. `Identity::record_transfer_attempt` emits an auditable event, ensuring transparency.

**On-chain enforcement:**
```rust
fn can_transfer(env, from, to, queue_id) {
    if from == to { return true }
    fail_with(ErrorCode::TransferNotAllowed)
}
```

### INV-2: Single Enrollment Per Identity Per Queue

An identity may hold **at most one enrollment record** for a given queue at any time.

*Proof Sketch:*  
`Enrollment::enroll` checks `is_enrolled(caller, queue_id)` before inserting. Duplicate enrollment triggers `fail_with(ErrorCode::AlreadyEnrolled)`. The check is atomic within the contract, preventing race conditions.

**On-chain enforcement:**
```rust
fn enroll(env, caller, queue_id) {
    if is_enrolled(caller, queue_id) { fail_with(ErrorCode::AlreadyEnrolled) }
    // ... insert record
}
```

### INV-3: Escrow Amounts Are Within Configured Bounds

All deposits are validated against `min_deposit` and `max_deposit` at the time of the call.

*Proof Sketch:*  
`Escrow::deposit` reads `EscrowConfig` for the queue, compares `amount`, and rejects out-of-range values. This prevents under-collateralized or fraudulently excessive payments.

### INV-4: Admin Operations Require Authorization

All administrative actions (`deactivate_queue`, `reactivate_queue`, `set_config`, `release`, `refund`) require `admin.require_auth()`.

*Proof Sketch:*  
Soroban's `Address::require_auth` ensures that only the holder of the admin keypair can authorize state mutations. The admin address is fixed at `QueueFactory::initialize` and cannot be changed in v0.1, eliminating takeover risk.

---

## 3. Liveness Invariants ("Something Good Eventually Happens")

### LIVE-1: Enrollment Window Determinism

If an identity calls `enroll` during the window `[enrollment_open, enrollment_close)` and has not previously enrolled, the call **succeeds** and a `Position` is created.

*Proof Sketch:*  
The `Queue::enroll` logic only guards on time boundaries and prior enrollment. No discretionary off-chain input alters the outcome for compliant callers.

### LIVE-2: Advancement Progresses Toward Completion

If `advance(batch_size)` is called by the admin while positions remain in `Pending`, at least one position transitions to `Advanced` (or the queue is reported as fully advanced).

*Proof Sketch:*  
`advance` iterates over pending positions in order and updates status until either `batch_size` positions are advanced or all are exhausted. The loop terminates monotonically.

---

## 4. Fairness Invariants

### FAIR-1: No Back-Door Priority

The protocol does not define hidden priority channels. All advancement is governed by the `advancement_rule` declared at deployment. In v0.1, this is strictly `FIFO` (first-enrolled, first-advanced).

### FAIR-2: Transparency of State Changes

Every state transition emits a deterministic Soroban event. External observers can reconstruct the full state machine from the event log.

### FAIR-3: Escrow Is Not Admin-Discretionary

Funds in escrow are released or refunded according to pre-declared rules (successful advancement or queue cancellation), not by individual admin decisions on a per-case basis. This protects participants from arbitrary punishment or selective enrichment.

---

## 5. Threat Model Coverage

| Threat | Mitigation Invariant |
|--------|----------------------|
| Scalping | INV-1 (No Transfer) |
| Duplicate enrollment | INV-2 (Single Enrollment) |
| Underpayment / overpayment | INV-3 (Escrow Bounds) |
| Admin abuse | INV-4 (Authorization) |
| Opacity | FAIR-2 (Transparency) |
| Selective treatment | FAIR-3 (Protocol-driven escrow) |

---

## 6. Formal Verification Targets

Future audit milestones should target the following safety properties with formal methods:
1. **Termination of `advance`**: progress is guaranteed.
2. **Consistency of `EnrollmentRecord`**: no two records for same `(identity, queue_id)`.
3. **Escrow state machine**: `Active → Released | Refunded | Expired` is a DAG without cycles.
4. **Factory registry consistency**: slug uniqueness is preserved across `deploy_queue` and `register_queue`.

These invariants form the security backbone of LineProof. Any implementation deviation must undergo adversarial test review.
