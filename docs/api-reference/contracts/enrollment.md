# Soroban Contract Interface — `lineproof-enrollment`

The `lineproof-enrollment` contract generates cryptographic SHA256 enrollment proof hashes, handles duplicate enrollment policies (`Reject`, `GrantWaitingList`, `OverrideExpired`), and manages enrollment finalization and waiting lists.

- **Source**: [`contracts/lineproof-enrollment/src/lib.rs`](file:///Users/mac/LINEPROOF%201/contracts/lineproof-enrollment/src/lib.rs)

---

## Data Structures

### `DuplicateBehavior` (Enum)
```rust
pub enum DuplicateBehavior {
    Reject,
    GrantWaitingList,
    OverrideExpired,
}
```

### `EnrollmentProof` (Struct)
```rust
pub struct EnrollmentProof {
    pub queue_id: Symbol,
    pub identity: Address,
    pub enrolled_at: u64,
    pub proof_hash: BytesN<32>,
    pub expires_at: Option<u64>,
}
```

### `EnrollmentRecord` (Struct)
```rust
pub struct EnrollmentRecord {
    pub identity: Address,
    pub queue_id: Symbol,
    pub enrolled_at: u64,
    pub proof_hash: BytesN<32>,
    pub duplicate_count: u32,
    pub finalized: bool,
    pub expires_at: Option<u64>,
}
```

---

## Functions

### 1. `enroll`
Enrolls a caller into a queue and computes a 32-byte SHA256 proof hash over the preimage `(identity, queue_id, enrolled_at)`.

- **Signature**: `enroll(env: Env, caller: Address, queue_id: Symbol, expires_at: Option<u64>) -> EnrollmentProof`
- **Parameters**:
  - `caller: Address` — Identity enrolling (must authenticate).
  - `queue_id: Symbol` — Queue slug/identifier.
  - `expires_at: Option<u64>` — Optional timestamp after which enrollment proof expires.
- **Return Type**: `EnrollmentProof`
- **Panics / Error Conditions**:
  - `"duplicate enrollment"` — Caller is already enrolled and `dup_behavior` is `Reject` (or active non-expired for `OverrideExpired`).
  - `"already waitlisted"` — Caller is already on waitlist under `GrantWaitingList` behavior.
- **Example Invocation**:
  ```bash
  stellar contract invoke \
    --id CENROLLMENT... \
    --source-account applicant \
    -- \
    enroll \
    --caller GUSER... \
    --queue_id "vip-queue" \
    --expires_at null
  ```

---

### 2. `cancel`
Removes an active enrollment record and decrements total queue enrollment count.

- **Signature**: `cancel(env: Env, caller: Address, queue_id: Symbol)`
- **Parameters**:
  - `caller: Address` — Enrolled identity (must authenticate).
  - `queue_id: Symbol` — Queue identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not enrolled"` — Record does not exist for `(caller, queue_id)`.

---

### 3. `set_duplicate_behavior`
Configures handling rule when an already enrolled identity attempts to re-enroll.

- **Signature**: `set_duplicate_behavior(env: Env, admin: Address, behavior: DuplicateBehavior)`
- **Parameters**:
  - `admin: Address` — Contract administrator (must authenticate).
  - `behavior: DuplicateBehavior` — Policy (`Reject`, `GrantWaitingList`, or `OverrideExpired`).
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"behavior_not_supported"` — Invalid duplicate policy.

---

### 4. `finalize_enrollment`
Locks an enrollment record as permanently finalized by the admin.

- **Signature**: `finalize_enrollment(env: Env, admin: Address, identity: Address, queue_id: Symbol)`
- **Parameters**:
  - `admin: Address` — Administrator (must authenticate).
  - `identity: Address` — Target participant identity.
  - `queue_id: Symbol` — Queue identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"record missing"` — Record does not exist.
  - `"already finalized"` — Record is already finalized.

---

### 5. `get_waitlist`, `waitlist_position`, & `promote_from_waitlist`
- **`get_waitlist(env: Env, queue_id: Symbol) -> Vec<Address>`**: Returns waitlist array for queue.
- **`waitlist_position(env: Env, identity: Address, queue_id: Symbol) -> Option<u32>`**: Returns 0-based index if on waitlist.
- **`promote_from_waitlist(env: Env, admin: Address, queue_id: Symbol, count: u32)`**: Promotes up to `count` identities from waitlist to enrolled status.
