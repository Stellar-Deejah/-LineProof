# Soroban Contract Interface — `lineproof-identity`

The `lineproof-identity` contract binds participant identities to queues, enforces non-transferability invariants, tracks illegal transfer attempts, and provides administrative revocation functionality.

- **Source**: [`contracts/lineproof-identity/src/lib.rs`](file:///Users/mac/LINEPROOF%201/contracts/lineproof-identity/src/lib.rs)

---

## Data Structures

### `BindingStatus` (Enum)
```rust
pub enum BindingStatus {
    Unbound,
    Bound,
    Revoked,
}
```

### `IdentityRecord` (Struct)
```rust
pub struct IdentityRecord {
    pub identity: Address,
    pub bound_at: u64,
    pub queues: Vec<Symbol>,
    pub status: BindingStatus,
}
```

### `TransferAttempt` (Struct)
```rust
pub struct TransferAttempt {
    pub from: Address,
    pub to: Address,
    pub timestamp: u64,
    pub reverted: bool,
}
```

---

## Functions

### 1. `bind`
Binds an identity to a queue, establishing non-transferable queue membership.

- **Signature**: `bind(env: Env, identity: Address, queue_id: Symbol)`
- **Parameters**:
  - `identity: Address` — Participant identity (must authenticate call).
  - `queue_id: Symbol` — Queue slug/identifier.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"identity revoked"` — Identity binding status is `Revoked`.
- **Example Invocation**:
  ```bash
  stellar contract invoke \
    --id CIDENTITY... \
    --source-account applicant \
    -- \
    bind \
    --identity GUSER... \
    --queue_id "drop-1"
  ```

---

### 2. `can_transfer`
Enforces position non-transferability by evaluating transfer permissions.

- **Signature**: `can_transfer(env: Env, from: Address, to: Address, queue_id: Symbol) -> bool`
- **Parameters**:
  - `from: Address` — Current position holder.
  - `to: Address` — Recipient address.
  - `queue_id: Symbol` — Target queue.
- **Return Type**: `bool` — Returns `true` if `from == to` (self-transfer allowed), otherwise `false` unless explicitly enabled by admin.
- **Panics / Error Conditions**: Does not panic. Returns `false` if `from` is revoked or not bound to `queue_id`.

---

### 3. `revoke`
Revokes an identity completely across all bound queues.

- **Signature**: `revoke(env: Env, admin: Address, identity: Address)`
- **Parameters**:
  - `admin: Address` — Admin address (must authenticate).
  - `identity: Address` — Target identity to revoke.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"not initialized"` — Contract admin not set.
  - `"unauthorized"` — Caller is not contract admin.

---

### 4. `record_transfer_attempt`
Logs a reverted illegal transfer attempt on-chain for auditing.

- **Signature**: `record_transfer_attempt(env: Env, from: Address, to: Address, queue_id: Symbol)`
- **Parameters**: `from`, `to`, `queue_id`.
- **Return Type**: `()`

---

### 5. `unbind`, `is_bound`, `get_record`, `initialize`, `set_transfer_allowed`
- **`unbind(env: Env, identity: Address, queue_id: Symbol)`**: Unbinds identity from queue.
- **`is_bound(env: Env, identity: Address, queue_id: Symbol) -> bool`**: Returns `true` if identity is bound to queue.
- **`get_record(env: Env, identity: Address) -> Option<IdentityRecord>`**: Queries identity record.
- **`initialize(env: Env, admin: Address)`**: Initializes admin. Panics if `"already initialized"`.
- **`set_transfer_allowed(env: Env, admin: Address, allowed: bool)`**: Enables/disables global transfer permission.
