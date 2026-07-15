# [Enhancement] `DuplicateBehavior::GrantWaitingList` and `OverrideExpired` panic with "not yet implemented" in production code

**Labels:** `contracts`, `soroban`, `enhancement`, `bug`
**Difficulty:** Expert

---

## Problem

Three gaps exist in the `lineproof-enrollment` contract's duplicate enrollment handling:

1. **`GrantWaitingList` panics in production**
   `contracts/lineproof-enrollment/src/lib.rs` — `enroll()` matches on `DuplicateBehavior::GrantWaitingList` and calls `panic!("duplicate enrollment: waiting list not yet implemented")`. An admin can call `set_duplicate_behavior(env, admin, DuplicateBehavior::GrantWaitingList)` successfully (the setter has no validation). Any subsequent enrollment attempt by an already-enrolled identity will then cause the contract to panic rather than gracefully adding them to a waiting list. Since the admin-set behavior persists in storage, this misconfiguration can silently lock out all duplicate enrollments until the admin resets the behavior.

2. **`OverrideExpired` also panics, with no concept of "expired" positions**
   `DuplicateBehavior::OverrideExpired` panics with `"duplicate enrollment: override-expired not yet implemented"`. More fundamentally, the enrollment contract has no concept of position expiry — `EnrollmentRecord` has no `expires_at` field, no TTL, and no mechanism to mark a record as expired. Without that concept, the `OverrideExpired` variant is meaningless.

3. **`set_duplicate_behavior` has no validation — any admin can set an unusable behavior**
   The setter allows any authenticated admin to configure `GrantWaitingList` or `OverrideExpired` without any guard that checks whether the behavior is actually implemented. There is no `is_behavior_supported()` function, no event emitted, and no way for an operator to discover at configuration time that the behavior they selected will cause panics at enrollment time.

**Impact:** An operator who reads the SDK types (`DuplicateBehavior` with three variants in `sdk/src/types.ts` — actually this is not in `types.ts` but is represented by the contract enum), the contract source, or the ARCHITECTURE.md might reasonably configure `GrantWaitingList` for a high-demand queue. When participants try to enroll, the contract panics. This would cause every duplicate enrollment to return an on-chain error — silently failing in the SDK since `EnrollmentClient.enroll()` does not check the returned result XDR.

---

## Proposed Solution

**Implement `GrantWaitingList`:**
- Add a `waiting_list` storage concept: a separate `Vec<Address>` keyed by `("waitlist", queue_id)`.
- When `GrantWaitingList` is active and a duplicate enrollment occurs, append the identity to the waiting list and emit a `WaitlistAdded` event rather than panicking.
- Add `fn get_waitlist(env, queue_id) -> Vec<Address>` and `fn waitlist_position(env, identity, queue_id) -> Option<u32>` to the contract trait.
- Add `fn promote_from_waitlist(env, admin, queue_id, count)` to advance waiting-list participants into active enrollment.

**Define expiry for `OverrideExpired`:**
- Add `expires_at: Option<u64>` to `EnrollmentRecord` (set when `enroll()` is called with an expiry parameter, or derived from queue config).
- When `OverrideExpired` is active and a duplicate enrollment occurs, check if the existing record has expired (`now > expires_at`). If so, replace the record (override). If not, reject as a duplicate.

**Guard `set_duplicate_behavior`:**
- Add a `is_supported_behavior(behavior)` check: only `Reject` and the newly implemented behaviors pass. Panic with `"behavior_not_supported"` for unimplemented variants.
- Emit a `DuplicateBehaviorChanged` event with the new behavior value.

---

## Acceptance Criteria

- [ ] `GrantWaitingList` behavior adds duplicate enrollees to a `Vec<Address>` waitlist
- [ ] `WaitlistAdded` event emitted on waitlist addition
- [ ] `get_waitlist(env, queue_id)` returns waitlisted identities
- [ ] `waitlist_position(env, identity, queue_id)` returns the 0-indexed position or `None`
- [ ] `promote_from_waitlist(env, admin, queue_id, count)` moves waitlisted identities to active enrollment
- [ ] `EnrollmentRecord` has `expires_at: Option<u64>` field
- [ ] `OverrideExpired` replaces an expired record; rejects an unexpired duplicate
- [ ] `set_duplicate_behavior` panics with `"behavior_not_supported"` for unimplemented variants (none currently, but the guard is future-proof)
- [ ] `DuplicateBehaviorChanged` event emitted by `set_duplicate_behavior`
- [ ] All pre-existing enrollment tests pass
- [ ] New tests cover: waitlist addition, waitlist promotion, override-expired success, override-expired rejection for unexpired record

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Justify the data structure choice for the waitlist (`Vec<Address>` vs. a separate keyed counter-indexed store) and discuss the gas implications of `Vec` growth on Soroban.
- Explain the semantics of `promote_from_waitlist` — does it create a new `EnrollmentRecord` for the promoted address, and does it inherit the original waitlist enrollment timestamp?
- Discuss whether `expires_at` on `EnrollmentRecord` should be set by the enrollment contract or propagated from the queue contract's `enrollment_close` timestamp.
- Show `cargo test -p lineproof-enrollment -- --nocapture` output.
