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

---

## 5. Initialize the Factory

```bash
soroban contract invoke \
  --id $FACTORY_CONTRACT_ID \
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

## 7. Mainnet Checklist

Before deploying to mainnet:

- [ ] Independent smart-contract audit completed
- [ ] Admin authority moved to multisig
- [ ] All testnet integration tests passing
- [ ] CHANGELOG.md updated with release notes
- [ ] Deployment artifact hashes published
- [ ] Incident response runbook reviewed
