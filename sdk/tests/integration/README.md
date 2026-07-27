# Integration Tests

This directory contains integration tests for the LineProof SDK that run against a real Soroban network (localnet). These tests validate the entire transaction path including XDR encoding, signature generation, and contract invocation.

## Purpose

Unlike unit tests which mock Stellar SDK internals, integration tests:
- Deploy real WASM contracts to a running Soroban node
- Execute actual contract transactions
- Validate XDR argument encoding and serialization
- Test transaction submission and finalization
- Verify on-chain contract state changes

## Prerequisites

1. **Build contracts**: The contracts must be built to WASM first
   ```bash
   cd contracts
   cargo build --target wasm32-unknown-unknown --release
   cd ..
   ```

2. **Start local Soroban network**: Use Docker Compose to start the local testnet
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

3. **Wait for readiness**: Ensure the Soroban RPC is ready
   ```bash
   curl http://localhost:8080/health
   ```

## Running Integration Tests

### Local Development

Run integration tests with verbose output:
```bash
cd sdk
pnpm test:integration
```

The tests will automatically:
- Check if Soroban RPC is available at `http://localhost:8080`
- Skip gracefully if not available (useful for CI without integration test label)
- Fund test accounts via friendbot
- Deploy contracts
- Execute test scenarios

### Environment Variables

You can customize the integration test environment:

- `SOROBAN_RPC_URL`: Soroban RPC endpoint (default: `http://localhost:8080`)
- `NETWORK_PASSPHRASE`: Network passphrase (default: `Standalone Network ; February 2017`)
- `FRIENDBOT_URL`: Friendbot URL for funding accounts (default: `http://localhost:8000/friendbot`)

Example:
```bash
SOROBAN_RPC_URL=http://localhost:8080 \
NETWORK_PASSPHRASE="Standalone Network ; February 2017" \
FRIENDBOT_URL=http://localhost:8000/friendbot \
pnpm test:integration
```

## CI Integration

Integration tests run in CI when triggered by:
- Commit message containing `[run-integration-tests]`
- Pull request labeled with `run-integration-tests`
- Manual workflow dispatch

The CI job:
1. Builds contracts to WASM
2. Starts Docker Compose stack (stellar-core + soroban-rpc)
3. Waits for Soroban RPC health check
4. Builds the SDK
5. Runs integration tests with environment variables
6. Tears down Docker Compose stack

## Test Files

### `setup.ts`
Helper module providing:
- `isSorobanAvailable()`: Check if RPC is reachable
- `fundAccount()`: Fund accounts via friendbot
- `createFundedKeypair()`: Create and fund a test keypair
- `uploadWasm()`: Upload WASM bytecode
- `installContract()`: Install contract from WASM
- `deployContract()`: Combined upload + install
- `waitForTransaction()`: Poll for transaction finalization
- `setupIntegrationTest()`: Complete test environment setup
- `getWasmPaths()`: Get paths to built WASM files

### `queue.integration.test.ts`
Tests the Queue contract:
- Contract deployment
- Queue initialization with config
- Opening enrollment
- Enrolling positions
- Getting position data
- Advancing queue
- Closing queue
- Getting queue config

### `enrollment.integration.test.ts`
Tests the Enrollment contract:
- Contract deployment
- Enrolling in queues
- Checking enrollment status
- Getting enrollment records
- Getting enrollment count
- Canceling enrollment
- Read-only client behavior

### `escrow.integration.test.ts`
Tests the Escrow contract:
- Contract deployment
- Setting escrow config
- Depositing to escrow
- Getting escrow records
- Getting escrow config
- Getting total held amount
- Releasing escrow
- Refunding escrow
- Expiring escrow
- SDK validation (reject non-positive amounts)
- Read-only client behavior

## Transaction Finalization

The integration tests handle the async nature of Soroban transactions:

1. **Submit transaction**: Transaction is submitted to the network
2. **Poll for result**: Tests poll for transaction status using `waitForTransaction()`
3. **Validate success**: Transaction hash is validated as a non-empty string
4. **Check state**: Contract state is queried via simulation to verify changes

The `waitForTransaction()` helper polls the Soroban RPC for transaction status with a configurable timeout (default 30 seconds).

## Skip Conditions

Integration tests skip gracefully when:
- Soroban RPC is not reachable (connection refused)
- Environment variables not configured
- Docker Compose stack not running

This allows unit tests to run without requiring a local Soroban node.

## Adding New Integration Tests

When adding new integration tests:

1. Import helpers from `./setup.ts`
2. Use `isSorobanAvailable()` to check connectivity in `beforeAll()`
3. Use `setupIntegrationTest()` to get funded accounts and deployed contracts
4. Wrap network operations in try-catch with skip logic
5. Set appropriate timeouts (30-60 seconds per test)
6. Test both success and error paths
7. Validate transaction hashes and on-chain state

Example template:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { LineProofClient } from '../../src';
import { setupIntegrationTest, isSorobanAvailable } from './setup';

describe('MyContract Integration Tests', () => {
  let client: LineProofClient;

  beforeAll(async () => {
    const available = await isSorobanAvailable();
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }
    const setup = await setupIntegrationTest({ deployContracts: true });
    client = setup.adminClient;
  }, 60000);

  it('should do something', async () => {
    const available = await isSorobanAvailable();
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }
    // Test implementation
  }, 30000);
});
```

## Troubleshooting

### Tests skip with "Soroban RPC not available"
- Ensure Docker Compose is running: `docker compose -f docker/docker-compose.yml ps`
- Check RPC health: `curl http://localhost:8080/health`
- Verify environment variables

### Contract deployment fails
- Ensure contracts are built: `ls contracts/target/wasm32-unknown-unknown/release/`
- Check WASM file paths in `getWasmPaths()`
- Verify admin account has sufficient XLM

### Transaction timeout
- Increase test timeout in the test case
- Check network congestion
- Verify friendbot is funding accounts properly

### XDR parsing errors
- Check contract function signatures match SDK calls
- Verify argument encoding (ScVal types)
- Review contract interface in `contracts/*/src/lib.rs`
