# Soroban Contract Interface — `lineproof-queue`

The `lineproof-queue` contract manages the lifecycle, position enrollment, position cancellation, and batch advancement of non-transferable waiting lists on Stellar's Soroban smart contract platform.

- **Contract ID**: Dynamic (deployed per queue instance via `lineproof-queue-factory`)
- **Source**: [`contracts/lineproof-queue/src/lib.rs`](file:///Users/mac/LINEPROOF%201/contracts/lineproof-queue/src/lib.rs)

---

## Data Structures

### `QueueStatus` (Enum)
```rust
pub enum QueueStatus {
    Draft,
    EnrollmentOpen,
    EnrollmentClosed,
    AdvancementActive,
    Closed,
}
```

### `PositionStatus` (Enum)
```rust
pub enum PositionStatus {
    Pending,
    Advanced,
    Expired,
    Cancelled,
}
```

### `AdvancementRule` (Enum)
```rust
pub enum AdvancementRule {
    Fifo,
    PriorityTier,
    VerifiableRandomness,
}
```

### `QueueConfig` (Struct)
```rust
pub struct QueueConfig {
    pub slug: Symbol,
    pub name: Symbol,
    pub admin: Address,
    pub max_positions: u32,
    pub enrollment_open: u64,
    pub enrollment_close: u64,
    pub status: QueueStatus,
    pub version: u32,
    pub advancement_rule: AdvancementRule,
}
```

### `Position` (Struct)
```rust
pub struct Position {
    pub position_id: u32,
    pub enrolled_at: u64,
    pub identity: Address,
    pub status: PositionStatus,
    pub advanced_at: Option<u64>,
    pub priority_weight: Option<u32>,
}
```

---

## Storage & TTL Policy
- **Threshold**: `10,000` ledgers (~13.8 hours)
- **Extension Target**: `6,307,200` ledgers (~1 year)
- **Instance and Persistent Keys**: `config`, `next_id`, `idx`, `version`, `("pos", id)`, `pending_admin`.

---

## Functions

### 1. `initialize`
Initializes a newly deployed queue contract instance with its initial configuration and admin address.

- **Signature**: `initialize(env: Env, admin: Address, config: QueueConfig)`
- **Parameters**:
  - `admin: Address` — Queue administrator address (must authenticate call).
  - `config: QueueConfig` — Queue configuration settings.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not_admin"` — If `config.admin != admin` or if `admin` signature authentication fails.
- **Example Invocation (Stellar CLI)**:
  ```bash
  stellar contract invoke \
    --id CQUEUE... \
    --source-account admin \
    --network testnet \
    -- \
    initialize \
    --admin GADMIN... \
    --config '{"slug":"drop-1","name":"Drop 1","admin":"GADMIN...","max_positions":1000,"enrollment_open":0,"enrollment_close":0,"status":"Draft","version":1,"advancement_rule":"Fifo"}'
  ```

---

### 2. `open_enrollment`
Transitions queue status from `Draft` to `EnrollmentOpen`.

- **Signature**: `open_enrollment(env: Env, admin: Address)`
- **Parameters**:
  - `admin: Address` — Administrator address (must authenticate).
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not_admin"` — Caller is not the registered queue admin.
  - `"enrollment can only be opened from draft state"` — Queue is not in `Draft` status.
- **Example Invocation**:
  ```bash
  stellar contract invoke --id CQUEUE... --source-account admin -- open_enrollment --admin GADMIN...
  ```

---

### 3. `enroll_position`
Enrolls an identity into the waiting list and assigns a sequential `position_id`.

- **Signature**: `enroll_position(env: Env, identity: Address) -> u32`
- **Parameters**:
  - `identity: Address` — Applicant address enrolling into queue (must authenticate).
- **Return Type**: `u32` — Assigned sequential position ID (starts at 1).
- **Panics / Error Conditions**:
  - `"enrollment is not open"` — Queue status is not `EnrollmentOpen`.
  - `"queue is full"` — Assigned position ID would exceed `config.max_positions`.
- **Example Invocation**:
  ```bash
  stellar contract invoke --id CQUEUE... --source-account applicant -- enroll_position --identity GUSER...
  ```

---

### 4. `close_enrollment`
Closes the enrollment phase, transitioning status from `EnrollmentOpen` to `EnrollmentClosed`.

- **Signature**: `close_enrollment(env: Env, admin: Address)`
- **Parameters**:
  - `admin: Address` — Administrator address (must authenticate).
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not_admin"` — Caller is not the registered queue admin.
  - `"enrollment can only be closed from enrollment_open state"` — Queue is not in `EnrollmentOpen` status.

---

### 5. `advance`
Advances up to `batch_size` pending positions according to the queue's `advancement_rule`.

- **Signature**: `advance(env: Env, admin: Address, batch_size: u32) -> Vec<u32>`
- **Parameters**:
  - `admin: Address` — Administrator address (must authenticate).
  - `batch_size: u32` — Maximum number of positions to advance in this transaction batch.
- **Return Type**: `Vec<u32>` — Vector of newly advanced position IDs.
- **Panics / Error Conditions**:
  - `"not_admin"` — Caller is not the queue admin.
  - `"queue is closed"` — Queue is in `Closed` state.
  - `"enrollment must be closed before advancing"` — Status is not `EnrollmentClosed` or `AdvancementActive`.
  - `"priority_tier_not_implemented"` / `"vrf_not_implemented"` — Unimplemented advancement rules.

---

### 6. `cancel_position`
Allows an enrolled identity to cancel their own pending position.

- **Signature**: `cancel_position(env: Env, identity: Address, position_id: u32)`
- **Parameters**:
  - `identity: Address` — Enrolled identity (must authenticate).
  - `position_id: u32` — Position ID to cancel.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not your position"` — `pos.identity != identity`.
  - `"only pending positions can be cancelled"` — Position status is not `Pending`.
  - `"position not found"` — Invalid `position_id`.

---

### 7. `get_position`
Queries the details of a position by ID.

- **Signature**: `get_position(env: Env, position_id: u32) -> Option<Position>`
- **Parameters**:
  - `position_id: u32` — Target position ID.
- **Return Type**: `Option<Position>` — `Some(Position)` if found, otherwise `None`.
- **Panics / Error Conditions**: Does not panic; returns `None` if `position_id == 0` or missing.

---

### 8. `get_config`
Retrieves the queue's configuration object.

- **Signature**: `get_config(env: Env) -> QueueConfig`
- **Parameters**: None.
- **Return Type**: `QueueConfig`
- **Panics / Error Conditions**:
  - `"queue not initialized"` — Storage key `"config"` missing.

---

### 9. `current_position_index` & `total_enrolled`
- **`current_position_index(env: Env) -> u32`**: Returns the current advancement index (`idx`).
- **`total_enrolled(env: Env) -> u32`**: Returns the total number of enrolled positions (`next_id - 1`).

---

### 10. `expire_position` & `expire_positions_batch`
Marks pending position(s) as `Expired` during or after advancement.

- **`expire_position(env: Env, admin: Address, position_id: u32)`**
- **`expire_positions_batch(env: Env, admin: Address, position_ids: Vec<u32>)`**
- **Panics / Error Conditions**:
  - `"not_admin"` — Caller is not queue admin.
  - `"queue must be in advancement or closed state"` — Status is invalid.
  - `"only pending positions can be expired"` — Position is not `Pending`.

---

### 11. `close`
Permanently closes the queue.

- **Signature**: `close(env: Env, admin: Address)`
- **Parameters**: `admin: Address` (must authenticate).
- **Panics / Error Conditions**: `"not_admin"`, `"queue is closed"`.

---

### 12. `propose_admin` & `accept_admin`
Two-step admin transfer:
- **`propose_admin(env: Env, current_admin: Address, proposed_admin: Address)`**: Current admin proposes new admin.
- **`accept_admin(env: Env, proposed_admin: Address)`**: Proposed admin accepts and assumes ownership.
- **Panics / Error Conditions**: `"not_admin"`, `"not_pending_admin"`.

---

### 13. `upgrade` & `migrate`
- **`upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>)`**: Emits upgrade beacon.
- **`migrate(env: Env, admin: Address, from_version: u32, to_version: u32)`**: Validates and executes contract version migration logic.
