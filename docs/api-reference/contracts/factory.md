# Soroban Contract Interface — `lineproof-queue-factory`

The `lineproof-queue-factory` contract deploys, registers, verifies, deactivates, and upgrades queue instances on-chain using Soroban's deployment primitives (`env.deployer()`).

- **Source**: [`contracts/lineproof-queue-factory/src/lib.rs`](file:///Users/mac/LINEPROOF%201/contracts/lineproof-queue-factory/src/lib.rs)

---

## Data Structures

### `QueueMetadata` (Struct)
```rust
pub struct QueueMetadata {
    pub slug: Symbol,
    pub name: Symbol,
    pub owner: Address,
    pub contract_id: BytesN<32>,
    pub version: u32,
    pub deployed_at: u64,
    pub active: bool,
}
```

### `FactoryConfig` (Struct)
```rust
pub struct FactoryConfig {
    pub admin: Address,
    pub min_version: u32,
    pub max_version: u32,
}
```

---

## Functions

### 1. `deploy_queue`
Deploys a new `lineproof-queue` contract instance from an approved WASM hash.

- **Signature**: `deploy_queue(env: Env, deployer: Address, slug: Symbol, name: Symbol, version: u32, wasm_hash: BytesN<32>) -> BytesN<32>`
- **Parameters**:
  - `deployer: Address` — Creator address (must authenticate).
  - `slug: Symbol` — Unique queue slug.
  - `name: Symbol` — Display name.
  - `version: u32` — Target contract version.
  - `wasm_hash: BytesN<32>` — Approved Soroban WASM hash.
- **Return Type**: `BytesN<32>` — 32-byte Contract ID of the newly deployed queue contract.
- **Panics / Error Conditions**:
  - `"version out of bounds"` — `version < min_version || version > max_version`.
  - `"queue with this slug already exists"` — Slug key already registered in factory storage.
  - `"WASM hash not approved"` / `"wasm hash not approved"` — Hash not in factory approved registry.
- **Example Invocation**:
  ```bash
  stellar contract invoke \
    --id CFACTORY... \
    --source-account creator \
    -- \
    deploy_queue \
    --deployer GCREATOR... \
    --slug "concert-2026" \
    --name "Concert 2026" \
    --version 1 \
    --wasm_hash 6b89...
  ```

---

### 2. `register_queue`
Manually registers an existing queue contract with the factory.

- **Signature**: `register_queue(env: Env, admin: Address, slug: Symbol, contract_id: BytesN<32>, version: u32)`
- **Parameters**: `admin`, `slug`, `contract_id`, `version`.
- **Return Type**: `()`
- **Panics / Error Conditions**: `"not authorized"`, `"queue already registered"`.

---

### 3. `upgrade_queue`
Upgrades a registered queue's WASM code to a higher version via `env.deployer().upgrade()`.

- **Signature**: `upgrade_queue(env: Env, admin: Address, slug: Symbol, new_version: u32, new_wasm_hash: BytesN<32>)`
- **Parameters**:
  - `admin: Address` — Factory admin (must authenticate).
  - `slug: Symbol` — Queue slug.
  - `new_version: u32` — Must be greater than current version.
  - `new_wasm_hash: BytesN<32>` — Approved new WASM hash.
- **Return Type**: `()`
- **Panics / Error Conditions**:
  - `"version must increase"` — `new_version <= metadata.version`.
  - `"not authorized"`, `"version out of bounds"`, `"WASM hash not approved"`.

---

### 4. Registry Queries & Admin Management
- **`get_queue(env: Env, slug: Symbol) -> Option<QueueMetadata>`**: Fetches queue metadata.
- **`list_queues(env: Env) -> Vec<Symbol>`**: Lists all registered queue slugs.
- **`verify_queue(env: Env, slug: Symbol) -> bool`**: Returns `true` if queue exists and is active.
- **`deactivate_queue` / `reactivate_queue` / `destroy_queue`**: Administrative state management functions.
- **`initialize(env: Env, admin: Address)`**: Initializes factory config (`min_version: 1`, `max_version: 1`).
