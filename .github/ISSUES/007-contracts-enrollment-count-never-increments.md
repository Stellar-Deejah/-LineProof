# [Bug] `enrollment_count` always returns 0 — counter key never written in `enroll()`

**Labels:** `bug`, `contracts`, `soroban`
**Difficulty:** Advanced

---

## Problem

Three related correctness bugs exist across two Soroban contracts:

1. **`lineproof-enrollment` — `enrollment_count()` is permanently broken**
   `contracts/lineproof-enrollment/src/lib.rs` exposes `enrollment_count(env, queue_id) -> u32` and maintains a separate `count_key` storage entry (`("enroll_cnt", queue_id)`). The `enroll()` function, however, **never reads or increments this key**. Every call to `enrollment_count()` will return `unwrap_or(0u32)` = `0` regardless of how many participants have enrolled. The `count_key()` helper and the `enrollment_count()` getter are entirely dead code as shipped.

2. **`lineproof-enrollment` — `cancel()` does not decrement the counter**
   Even once the increment is added, a symmetric decrement must be added to `cancel()`, otherwise the count drifts upward permanently and can never reflect the true number of active participants.

3. **`lineproof-escrow` — `get_total_held()` never decrements on state transition**
   `contracts/lineproof-escrow/src/lib.rs` correctly accumulates the deposit total in `deposit()` via the `("escrow_total", queue_id)` key, but `release()`, `refund()`, and `expire()` never subtract the record's `amount` from that key. Any call to `get_total_held()` after a non-deposit transition will overstate the actual held balance, making it useless as an auditable ledger balance.

**Impact:** Both bugs silently corrupt fairness-relevant accounting data that auditors, the SDK (`EscrowClient`), and the backend (`escrowService.ts`) rely on. An operator querying `enrollment_count` to decide whether to open advancement will always see 0. An auditor checking `get_total_held` will see an inflated balance that never decreases.

---

## Proposed Solution

**Enrollment counter fix:**
- In `EnrollmentImpl::enroll()`, after writing the `EnrollmentRecord` to persistent storage, read the current count from `count_key`, increment by 1, and write it back.
- In `EnrollmentImpl::cancel()`, after removing the record, read the current count, decrement by 1 (saturating at 0), and write it back.
- Add a `decrement_count` private helper analogous to the existing pattern.

**Escrow total fix:**
- In `EscrowImpl::release()`, `refund()`, and `expire()`, after updating the record status, read the `total_key`, subtract `record.amount` (saturating at 0 to guard against unexpected underflow), and persist the result.
- Add a private `decrement_total` helper that encapsulates the read-modify-write to avoid code duplication across the three transition functions.

Both fixes must be accompanied by updated tests in the respective `test.rs` files.

---

## Acceptance Criteria

- [ ] `enrollment_count(env, queue_id)` returns the correct count after multiple `enroll()` calls
- [ ] `enrollment_count(env, queue_id)` decreases by 1 after a successful `cancel()`
- [ ] `enrollment_count` never goes below 0 (saturating subtraction)
- [ ] `get_total_held(env, queue_id)` returns 0 after all deposits are released/refunded/expired
- [ ] `get_total_held` correctly reflects partial releases (some released, some still active)
- [ ] `get_total_held` never goes below 0 (saturating subtraction)
- [ ] All new behavior is covered by tests in `lineproof-enrollment/src/test.rs` and `lineproof-escrow/src/test.rs`
- [ ] All pre-existing contract tests still pass: `cargo test -p lineproof-enrollment` and `cargo test -p lineproof-escrow`
- [ ] No `unwrap()` without explicit fallback where the key may be missing on first access
- [ ] PR description explains the read-modify-write pattern used and why saturating subtraction was chosen

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Show `cargo test -p lineproof-enrollment -- --nocapture` and `cargo test -p lineproof-escrow -- --nocapture` output demonstrating all tests pass.
- Explain why the counter was not implemented in the original `enroll()` — whether it was intentional (deferred) or an oversight.
- Note any trade-offs between tracking counts in storage vs. deriving them from the slug index at query time.
- Confirm whether the `count_key` and `total_key` storage entries survive contract upgrades and whether TTL / ledger bump is needed.
