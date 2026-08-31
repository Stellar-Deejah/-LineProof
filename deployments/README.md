# Deployment manifests

`testnet-latest.json` in this directory is written and committed automatically by
[`.github/workflows/deploy-testnet.yml`](../.github/workflows/deploy-testnet.yml)
after every non-dry-run deployment. It is not committed by hand — the workflow
overwrites it on each successful run. See
[`testnet-latest.example.json`](./testnet-latest.example.json) for the shape it
takes.

## Schema

| Field | Description |
|---|---|
| `runNumber` | The GitHub Actions run number that produced this deployment. |
| `network` | Network name (currently always `testnet`). |
| `networkPassphrase` | Exact Stellar network passphrase used to sign/simulate transactions on this network. |
| `timestamp` | UTC deployment time, ISO 8601. |
| `dryRun` | `true` if this manifest came from a `dry_run` workflow trigger (contract IDs are placeholders, not real). |
| `admin` | Public key of the deployer/admin account used for `initialize()` calls. Never a secret key. |
| `contracts.<alias>.contractId` | Deployed contract ID (`C...`) for that contract. |
| `contracts.<alias>.envVar` | The backend environment variable this contract ID should be assigned to — see [`backend/.env.example`](../backend/.env.example). |
| `contracts.<alias>.initialized` | Present only for contracts that require `initialize()` (`lineproof-identity`, `lineproof-queue-factory`). `true` means the contract was confirmed initialized, either by this run or a prior one. |

## Populating a backend `.env` from this file (CD pipeline sketch)

```bash
for alias in lineproof-enrollment lineproof-identity lineproof-escrow lineproof-queue lineproof-queue-factory; do
  contractId=$(jq -r ".contracts[\"$alias\"].contractId" deployments/testnet-latest.json)
  envVar=$(jq -r ".contracts[\"$alias\"].envVar" deployments/testnet-latest.json)
  echo "${envVar}=${contractId}"
done >> backend/.env
echo "NETWORK_PASSPHRASE=$(jq -r '.networkPassphrase' deployments/testnet-latest.json)" >> backend/.env
```

A CD job would run this after the `deploy-testnet` workflow completes (e.g.
triggered by `workflow_run`), write the resulting `.env`, and restart/redeploy
the backend so `ContractAdapter` picks up the new chain state instead of mock
mode. See `backend/.env.example` for the full list of required variables.

## Idempotency

Contract IDs are stable across reruns for unchanged WASM: the workflow
re-registers `stellar contract alias` entries from this file before deploying,
so `stellar contract deploy --alias <name>` resolves to the existing instance
rather than deploying a new one. `initialize()` is only re-invoked when the
contract itself hasn't already recorded an admin — a rerun against an
unchanged, already-initialized contract is a no-op, not a failure.
