# Runbook: Contract Deployment

Step-by-step guide for deploying LineProof contracts to localnet, testnet, and mainnet.

---

## Prerequisites

- Rust stable + `wasm32-unknown-unknown` target
- Soroban CLI installed (`cargo install --locked soroban-cli`)
- A funded Stellar account (use Friendbot on testnet/localnet)
- `.env` with `STELLAR_PRIVATE_KEY` set

---

## 1. Build WASM Artifacts

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

Artifacts are in `contracts/target/wasm32-unknown-unknown/release/`.

---

## 2. Configure Soroban CLI Identity

```bash
echo "$STELLAR_PRIVATE_KEY" | soroban keys add deployer --secret-key
soroban keys address deployer   # verify
```

---

## 3. Deploy to Localnet

```bash
make docker-up
make deploy-localnet
```

The deploy script (`scripts/deploy_localnet.sh`) deploys all contracts and writes contract IDs to `deployments/localnet.json`.

---

## 4. Deploy to Testnet

Fund the deployer account first:

```bash
./scripts/fund_testnet_accounts.sh $(soroban keys address deployer)
```

Deploy each contract:

```bash
# Enrollment
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_enrollment.wasm \
  --source deployer --network testnet

# Identity
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_identity.wasm \
  --source deployer --network testnet

# Escrow
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_escrow.wasm \
  --source deployer --network testnet

# Queue
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_queue.wasm \
  --source deployer --network testnet

# Factory (deploy last — registers queue contract hash)
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_queue_factory.wasm \
  --source deployer --network testnet
```

Save all returned contract IDs to `deployments/testnet.json`.

> The manual steps above are automated end-to-end by
> [`.github/workflows/deploy-testnet.yml`](../.github/workflows/deploy-testnet.yml)
> (`workflow_dispatch`, with a `dry_run` mode for testing the pipeline). It
> captures every contract ID, calls `initialize()` on the factory and
> identity contracts, and commits the result to
> [`deployments/testnet-latest.json`](../deployments/testnet-latest.example.json).
> Prefer it over the manual steps below for testnet.

---

## 5. Initialize the Factory and Identity Contracts

Both `lineproof-queue-factory` and `lineproof-identity` require `initialize()`
before use — calls against either one will panic with `not initialized`
otherwise. Calling `initialize()` a second time against the same deployed
instance panics with `already initialized`; treat that as a no-op, not an
error.

```bash
soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin $(soroban keys address deployer)

soroban contract invoke \
  --id $IDENTITY_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin $(soroban keys address deployer)
```

---

## 6. Verify Deployment

```bash
./scripts/check_contract_storage.sh $FACTORY_CONTRACT_ID '"config"'
```

Expected output includes `admin`, `min_version`, and `max_version` fields.

---

## 7. Deploy a Queue via the Factory (with salt)

Queue contracts are created by invoking `deploy_queue` on the factory. The
factory deploys a fresh `lineproof_queue` instance on your behalf using
Soroban's deterministic address derivation:

```
queue address = address(factory) + wasm_hash(queue.wasm) + salt
```

Because the address depends on the **salt**, two calls that use the same
factory and WASM but different salts produce **different** queue addresses.
This makes every deployment front-running safe: a caller cannot observe your
submission and force you onto the same address (the historical default-salt
behaviour, see [#206]).

```bash
# Generate a random 32-byte salt (hex, 64 chars)
SALT=$(openssl rand -hex 32)

soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- deploy_queue \
  --deployer $(soroban keys address deployer) \
  --slug sneaker-drop \
  --name "Sneaker Drop" \
  --version 1 \
  --wasm_hash $QUEUE_WASM_HASH \
  --salt $SALT
```

Notes:

- `--wasm_hash` must be a **pre-installed** WASM hash. Upload it with
  `soroban contract install` first if it is not already on-chain.
- `--salt` accepts any 32-byte hex value. For repeatable/migratable queues you
  may pin a fixed salt; for unique per-drop queues generate one randomly.
- The returned value is the new queue's `Address`, recorded as the queue's
  identifier by downstream tooling.
- When driving the factory through the LineProof SDK, the
  `QueueDeploymentParams.salt` field is optional — omitting it makes the SDK
  generate a random salt automatically.

[#206]: https://github.com/Stellar-Deejah/-LineProof/issues/206

---

## 8. Mainnet Checklist

Before deploying to mainnet:

- [ ] Independent smart-contract audit completed
- [ ] Admin authority moved to multisig
- [ ] All testnet integration tests passing
- [ ] CHANGELOG.md updated with release notes
- [ ] Deployment artifact hashes published
- [ ] Incident response runbook reviewed
