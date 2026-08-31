# Soroban Contract Interface — `lineproof-escrow`

The `lineproof-escrow` contract manages anti-scalping deposit locks, funds release upon queue advancement/attendance, refunds upon cancellation, and time-bound deposit expirations.

- **Source**: [`contracts/lineproof-escrow/src/lib.rs`](file:///Users/mac/LINEPROOF%201/contracts/lineproof-escrow/src/lib.rs)

---

## Data Structures

### `EscrowStatus` (Enum)
```rust
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Expired,
}
```

### `EscrowConfig` (Struct)
```rust
pub struct EscrowConfig {
    pub queue_id: Symbol,
    pub min_deposit: i128,
    pub max_deposit: i128,
    pub hold_period_days: u64,
    pub admin: Address,
}
```

### `EscrowRecord` (Struct)
```rust
pub struct EscrowRecord {
    pub queue_id: Symbol,
    pub identity: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: EscrowStatus,
    pub created_at: u64,
    pub expires_at: u64,
    pub released_at: Option<u64>,
}
```

---

## Storage & TTL Policy
- **Threshold**: `10,000` ledgers (~13.8 hours)
- **Extension Target**: `6,307,200` ledgers (~1 year)
- **Keys**: `("escrow", queue_id, identity)`, `("escrow_config", queue_id)`, `("escrow_total", queue_id)`

---

## Functions

### 1. `deposit`
Locks a deposit for a user enrolling into a queue.

- **Signature**: `deposit(env: Env, caller: Address, queue_id: Symbol, amount: i128, asset: Address)`
- **Parameters**:
  - `caller: Address` — Depositor identity (must authenticate call).
  - `queue_id: Symbol` — Identifier of the queue.
  - `amount: i128` — Amount of token locked in escrow.
  - `asset: Address` — Contract address of the Stellar token asset.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"amount must be positive"` — `amount <= 0`.
  - `"existing escrow record"` — Caller already has an active escrow for `queue_id`.
  - `"amount outside configured bounds"` — Amount is less than `min_deposit` or exceeds `max_deposit`.
- **Example Invocation**:
  ```bash
  stellar contract invoke \
    --id CESCROW... \
    --source-account depositor \
    -- \
    deposit \
    --caller GUSER... \
    --queue_id "drop-1" \
    --amount 10000000 \
    --asset CASSET...
  ```

---

### 2. `release`
Releases locked escrow funds to the queue owner upon successful position advancement/redemption.

- **Signature**: `release(env: Env, admin: Address, identity: Address, queue_id: Symbol)`
- **Parameters**:
  - `admin: Address` — Escrow admin address (must authenticate).
  - `identity: Address` — Target participant identity.
  - `queue_id: Symbol` — Queue identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"escrow record not found"` — No deposit record exists for `(identity, queue_id)`.
  - `"escrow not active"` — Deposit status is not `Active`.

---

### 3. `refund`
Returns escrow deposit back to participant identity (e.g. queue cancellation or valid exit).

- **Signature**: `refund(env: Env, admin: Address, identity: Address, queue_id: Symbol)`
- **Parameters**:
  - `admin: Address` — Admin address (must authenticate).
  - `identity: Address` — Target participant identity.
  - `queue_id: Symbol` — Queue identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"escrow record not found"` — Record missing.
  - `"escrow not active"` — Record status is not `Active`.

---

### 4. `expire`
Marks an escrow record as expired after `hold_period_days` have elapsed without release or refund.

- **Signature**: `expire(env: Env, identity: Address, queue_id: Symbol)`
- **Parameters**:
  - `identity: Address` — Target participant identity.
  - `queue_id: Symbol` — Queue identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not expired"` — Current ledger timestamp is earlier than `expires_at`.
  - `"escrow not active"` — Record is not `Active`.

---

### 5. `get_record` & `get_config` & `set_config` & `get_total_held`
- **`get_record(env: Env, identity: Address, queue_id: Symbol) -> Option<EscrowRecord>`**: Returns escrow record for identity.
- **`get_config(env: Env, queue_id: Symbol) -> EscrowConfig`**: Returns queue escrow rules.
- **`set_config(env: Env, admin: Address, config: EscrowConfig)`**: Configures escrow parameters for a queue.
- **`get_total_held(env: Env, queue_id: Symbol) -> i128`**: Returns aggregate locked balance for `queue_id`.
