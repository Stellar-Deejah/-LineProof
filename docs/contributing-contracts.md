# Contributing to Soroban Contracts

This guide is for contributors working on LineProof's Soroban smart contracts.

## Prerequisites

- Rust stable toolchain (`rustup toolchain install stable`)
- `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- Stellar CLI (`cargo install --locked stellar-cli --features opt`)

## Project Layout

```
contracts/
├── Cargo.toml                    # workspace manifest
├── Soroban.toml                  # workspace-level Soroban config
├── lineproof-queue-factory/      # factory and registry
├── lineproof-queue/              # queue lifecycle and positions
├── lineproof-enrollment/         # enrollment records and proofs
├── lineproof-identity/           # identity binding and anti-transfer
└── lineproof-escrow/             # escrow holds and lifecycle
```

Each contract crate contains:
- `src/lib.rs` — contract interface, types, and implementation
- `src/test.rs` — unit tests using `soroban_sdk::testutils`
- `Cargo.toml` — crate dependencies
- `Soroban.toml` — contract ID and network bindings

## Running Tests

```bash
cd contracts
cargo test --workspace
```

For a single crate:

```bash
cargo test -p lineproof-escrow
```

## Building WASM

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

Artifacts appear in `contracts/target/wasm32-unknown-unknown/release/`.

## Contract Design Principles

1. **Contract state is the source of truth.** Never trust off-chain state over
   what the contract storage says.

2. **Authorize every privileged call.** All admin operations must call
   `admin.require_auth()`. Participant operations must call
   `caller.require_auth()`.

3. **Emit events for every fairness-relevant transition.** Queue lifecycle
   changes, enrollments, position advances, identity binds, and escrow
   state changes must all emit structured events.

4. **Validate inputs early and panic with descriptive messages.** Use
   `panic!("descriptive message")` for contract-level assertions so callers
   can map errors precisely.

5. **Keep personal data off-chain.** Store identifiers, hashes, and
   commitments on-chain, not names, email addresses, or documents.

6. **Persistent storage for all long-lived state.** Use
   `env.storage().persistent()` for records that must survive ledger gaps.

## Adding a New Contract Function

1. Define the new function in the `#[contract]` trait in `lib.rs`.
2. Implement it in the `#[contractimpl]` block.
3. Add at least one positive and one negative test in `test.rs`.
4. Emit a structured event if the function changes fairness-relevant state.
5. Update `CHANGELOG.md` under `[Unreleased]`.

## Storage Key Conventions

Keys are tuples prefixed with a `Symbol` namespace:

```rust
// Good
(Symbol::new(env, "escrow"), queue_id.clone(), identity.clone())

// Bad — no namespace, risks collision
(queue_id.clone(), identity.clone())
```

## Testing Panics

Use `#[should_panic(expected = "exact message")]` to test expected failure
modes. Wrap the test body in `panic::set_hook` to suppress output noise:

```rust
#[test]
#[should_panic(expected = "escrow not active")]
fn test_double_release_panics() {
    // ...
}
```
