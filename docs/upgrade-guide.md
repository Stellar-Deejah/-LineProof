# Upgrade Guide

This document describes how to upgrade LineProof contracts safely, with emphasis on the two-step upgrade + migrate process for queue contracts.

## Overview

Contract upgrades on Soroban are **irreversible once applied**. The LineProof upgrade model consists of two phases:

1. **WASM Upgrade**: Replace the contract code at a given address with new compiled bytecode
2. **Storage Migration**: Transform persisted data from the old schema to the new schema (if needed)

## Principles

1. Contract upgrades are irreversible once applied. Test thoroughly on testnet before mainnet.
2. Only the factory admin can authorize queue upgrades.
3. The new WASM must be deployed and its hash registered before the upgrade call.
4. Existing storage layout must remain compatible — adding fields is safe; removing or reordering is not.
5. Storage migrations are optional if the new schema is backward compatible; they are mandatory if storage structure changes.

## Soroban Contract Upgrade Model

### What is a WASM Upgrade?

A WASM upgrade replaces the contract code executing at a given contract address, but **leaves all persistent storage intact**. The new code reads and writes the same storage keys and values as the old code.

### Key Properties

- **Code replacement**: The new WASM becomes the new contract instance
- **Storage preservation**: All persistent storage entries remain unchanged
- **No automatic migration**: If the new code expects a different storage schema, it will fail to deserialize old data

### What is Storage Migration?

Storage migration is the process of reading data stored in the old schema, transforming it to match the new schema, and writing it back. This is needed when:

- A new field is added to an existing struct (XDR handles this gracefully, but you may want to initialize the new field)
- A field type or structure is changed
- A storage key format changes
- Fields are reordered (rarely needed with XDR)

## Queue Contract Upgrade Process

### Step 1: Build the New WASM

Build the updated queue contract:

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

The new WASM binary is written to:

```
target/wasm32-unknown-unknown/release/lineproof_queue.wasm
```

### Step 2: Upload the WASM to the Network

Install the new WASM using Soroban CLI:

```bash
soroban contract install \
  --wasm target/wasm32-unknown-unknown/release/lineproof_queue.wasm \
  --source deployer \
  --network testnet
```

This outputs a WASM hash (32 bytes, hex-encoded):

```
<new_wasm_hash>
```

Save this hash—you'll need it for the upgrade call.

### Step 3: (If Needed) Update Factory Version Range

If the factory enforces version bounds, update them to accept the new version:

```bash
soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- set_config \
  --admin $(soroban keys address admin) \
  --min_version 1 \
  --max_version 2
```

### Step 4: Register the WASM Hash

Register the new WASM hash with the factory so it can be used for upgrades:

```bash
soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- register_approved_hash \
  --admin $(soroban keys address admin) \
  --version 2 \
  --wasm_hash <new_wasm_hash>
```

### Step 5: Perform the WASM Upgrade

Call the factory's `upgrade_queue()` to perform the WASM upgrade:

```bash
soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- upgrade_queue \
  --admin $(soroban keys address admin) \
  --slug my-queue \
  --new_version 2 \
  --new_wasm_hash <new_wasm_hash>
```

At this point, the queue contract's code is updated but storage remains unchanged. If the new code can read the old storage schema, you're done. Otherwise, proceed to Step 6.

### Step 6: (If Needed) Perform Storage Migration

If the new contract version added fields, changed types, or reorganized storage, call the queue contract's `migrate()` function:

```bash
soroban contract invoke \
  --id $QUEUE_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- migrate \
  --admin $(soroban keys address admin) \
  --from_version 1 \
  --to_version 2
```

The `migrate()` function reads the stored version from contract storage, verifies it matches `from_version`, applies any necessary transformations, and updates the stored version to `to_version`.

### Step 7: Verify the Upgrade

Check that the queue contract was successfully upgraded:

```bash
soroban contract invoke \
  --id $QUEUE_CONTRACT_ID \
  --source admin \
  --network testnet \
  -- get_config
```

You should see the updated queue config. If the contract's behavior has changed visibly, perform integration tests to verify correctness.

## Storage Compatibility Rules

| Change                    | Safe? | Notes                                                                                                                                                          |
| ------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add new field to a struct | ✓ Yes | XDR ignores unknown fields during deserialization. New code can safely ignore old data lacking the field. Optionally run `migrate()` to initialize new fields. |
| Remove a field            | ✗ No  | Deserialization fails when old storage has the field but new code doesn't expect it.                                                                           |
| Reorder fields            | ✗ No  | XDR is order-sensitive; reordering breaks existing records.                                                                                                    |
| Change field type         | ✗ No  | Type mismatch panics during deserialization.                                                                                                                   |
| Add a new function        | ✓ Yes | No impact on storage or existing function behavior.                                                                                                            |
| Remove a function         | ✗ No  | Callers invoking the removed function fail.                                                                                                                    |
| Rename a storage key      | ✗ No  | Old data at the old key is orphaned; new code reads the new key and finds nothing.                                                                             |

## Two-Step Process: Why It Matters

### Why Not Just Upgrade?

Without a separate `migrate()` step, if the new code changes the storage schema, one of two things happens:

1. **Silent data corruption**: New code reads old-format data into new-format structs, getting garbage values or panicking
2. **Data loss**: If fields are dropped, their values disappear even though they were needed

The factory's previous `upgrade_queue()` implementation called `env.deployer().upgrade()` directly, bypassing any migration logic. This made queue upgrades **destructive operations** that could corrupt participant records.

### Why the Two-Step Process Works

1. **WASM upgrade** (Step 5): The new code is installed but hasn't run yet
2. **Manual migration** (Step 6): An explicit admin call transforms storage while the queue is operational
3. **Atomic consistency**: Either the migration fully succeeds or fails; there's no partial state
4. **Clear semantics**: Operators can reason about what storage changes occurred

## Rollback and Disaster Recovery

Contract WASM upgrades cannot be rolled back on-chain. Mitigation strategies:

- **Feature flags**: Gate new logic behind a storage flag readable by both old and new code
- **Parallel deployment**: Deploy a new queue contract and migrate participants to it
- **Testnet rehearsal**: Always perform upgrades on testnet first with a full integration test
- **Gradual rollout**: Upgrade non-critical queues first, monitor, then upgrade production queues

## Migration Implementation Guidelines

When implementing `migrate()` for a new version, follow this pattern:

```rust
pub fn migrate(env: Env, admin: Address, from_version: u32, to_version: u32) {
    admin.require_auth();
    let config = Self::get_config_internal(&env);
    if config.admin != admin {
        panic!("unauthorized");
    }

    let stored_version: u32 = env
        .storage()
        .persistent()
        .get(&Symbol::new(&env, "version"))
        .unwrap_or(1);

    if stored_version != from_version {
        panic!("version mismatch");
    }

    if to_version <= from_version {
        panic!("version must increase");
    }

    // Apply version-specific transformations
    match (from_version, to_version) {
        (1, 2) => {
            // Example: Initialize new field in all Position records
            let next_id: u32 = env
                .storage()
                .persistent()
                .get(&Symbol::new(&env, "next_id"))
                .unwrap_or(1);

            for i in 1..next_id {
                if let Some(mut pos) = Self::get_position(env.clone(), i) {
                    // Initialize new field if needed
                    pos.priority_weight = Some(0);
                    let key = Self::position_key(&env, i);
                    env.storage().persistent().set(&key, &pos);
                }
            }
        }
        _ => {} // No migration needed for other version pairs
    }

    // Update stored version
    let version_key = Symbol::new(&env, "version");
    env.storage().persistent().set(&version_key, &to_version);

    emit(&env, Symbol::new(&env, "Migrated"), from_version, &admin, to_version as u64);
}
```

## Idempotency

The current `migrate()` implementation is **not idempotent**: calling it twice with the same versions will panic on the second call (version mismatch). This is by design—migrations should run exactly once per version bump.

If you need to support retry semantics (e.g., migration partially failed and must be re-run), modify the version check:

```rust
// Allow re-running if in an intermediate state
if stored_version != from_version && stored_version != to_version {
    panic!("version mismatch");
}
if stored_version == to_version {
    return; // Already migrated; skip
}
```

## Testing Upgrades Locally

To test an upgrade locally with the Soroban test environment:

```rust
#[test]
fn test_upgrade_and_migrate() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(QueueImpl, ());
    env.mock_all_auths();

    let client = QueueImplClient::new(&env, &contract_id);
    let config = make_config(&env, &admin);
    client.initialize(&admin, &config);

    // Enroll some positions
    let user1 = Address::generate(&env);
    client.enroll_position(&user1);

    // Simulate upgrade (in real scenario, contract code would be replaced)
    let new_wasm_hash = [2u8; 32];
    client.upgrade(&admin, &new_wasm_hash);

    // Perform migration
    client.migrate(&admin, &1, &2);

    // Verify positions still accessible
    let pos = client.get_position(&1).unwrap();
    assert_eq!(pos.identity, user1);
}
```

## Deployment Checklist

Before upgrading on mainnet:

- [ ] Build new WASM: `cargo build --target wasm32-unknown-unknown --release`
- [ ] Run full contract test suite: `cargo test --workspace`
- [ ] Upload WASM to testnet and capture hash
- [ ] Register hash with factory
- [ ] Upgrade a test queue on testnet
- [ ] Run integration tests against upgraded queue
- [ ] If schema changed, test `migrate()` call
- [ ] Verify old queue behavior unaffected
- [ ] Document any breaking changes
- [ ] Obtain sign-off from queue operators
- [ ] Execute upgrade on mainnet during low-traffic window
- [ ] Monitor contract events for errors
- [ ] Have rollback plan ready (parallel queue deployment)

## Related Documentation

- [Queue Lifecycle](queue-lifecycle.md) — State machine and valid transitions
- [Event Model](event-model.md) — Contract events for audit reconstruction
- [Storage TTL](contract-storage-ttl.md) — How contracts extend TTL to prevent data loss
