# LineProof Soroban Contract WASM Artifacts

This directory is designated for holding compiled Soroban WASM binaries (`.wasm`) required for contract deployment via the LineProof SDK.

## Compiling Contract WASM Blobs

LineProof smart contracts are located in the `/contracts` directory at the repository root. To compile the contracts to webassembly:

```bash
# Build all contracts for target wasm32-unknown-unknown
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

Compiled WASM binaries are generated in `contracts/target/wasm32-unknown-unknown/release/`:
- `lineproof_queue_factory.wasm`
- `lineproof_queue.wasm`
- `lineproof_enrollment.wasm`
- `lineproof_escrow.wasm`
- `lineproof_identity.wasm`

## SDK Deployment Workflow

The SDK deploys contracts in a two-step Soroban process:

1. **WASM Upload** (`LineProofClient.uploadWasm(wasmBytes)`):
   - Invokes `Operation.uploadContractWasm({ wasm: Buffer.from(wasmBytes) })`.
   - Returns the hex-encoded SHA-256 WASM hash (`wasmHash`).

2. **Contract Instantiation** (`LineProofClient.installContract(wasmHash)`):
   - Invokes `Operation.createCustomContract({ address, wasmHash })`.
   - Returns the 56-character `C...` StrKey contract ID.

```typescript
import { LineProofClient } from '@lineproof/sdk';
import fs from 'fs';

const client = new LineProofClient({ ... });
const wasmBytes = fs.readFileSync('path/to/lineproof_queue_factory.wasm');

// Deploy two-step
const factoryContractId = await client.deployFactory(wasmBytes);
console.log(`Deployed Factory Contract ID: ${factoryContractId}`);
```
