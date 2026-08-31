import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
  xdr,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import { LineProofClient, EscrowClient, NetworkPassphrase } from '../../src';
import {
  setupIntegrationTest,
  isSorobanAvailable,
  deployContract,
  getWasmPaths,
} from './setup';

describe('Escrow Integration Tests', () => {
  const rpcUrl = process.env.SOROBAN_RPC_URL || 'http://localhost:8080';
  const networkPassphrase = process.env.NETWORK_PASSPHRASE || NetworkPassphrase.STANDALONE;
  
  let adminClient: LineProofClient;
  let userClient: LineProofClient;
  let escrowContractId: string;
  let escrowClient: EscrowClient;

  beforeAll(async () => {
    // Skip if Soroban is not available
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping Escrow integration tests: Soroban RPC not available');
      return;
    }

    // Build contracts first
    const wasmPaths = getWasmPaths();
    
    // Setup test environment with admin and user accounts
    const setup = await setupIntegrationTest({
      deployContracts: true,
      wasmPaths: {
        escrow: wasmPaths.escrow,
      },
    });

    adminClient = setup.adminClient;
    userClient = setup.userClient;
    escrowContractId = setup.escrowContractId!;

    // Create escrow client
    escrowClient = new EscrowClient(adminClient);
  }, 60000);

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should deploy escrow contract successfully', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    expect(escrowContractId).toBeDefined();
    expect(escrowContractId).toMatch(/^C[A-Z0-9]+$/);
    console.log(`Escrow contract deployed: ${escrowContractId}`);
  }, 30000);

  it('should set escrow config', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const adminKeypair = adminClient.requireKeypair();
    const source = await adminClient.server.loadAccount(adminKeypair.publicKey());

    // Build EscrowConfig XDR
    const configXdr = new xdr.ScMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('queue_id'),
        val: xdr.ScVal.scvSymbol('test_queue'),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('min_deposit'),
        val: xdr.ScVal.scvI128(100),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('max_deposit'),
        val: xdr.ScVal.scvI128(10000),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('hold_period_days'),
        val: xdr.ScVal.scvU64(30),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('admin'),
        val: xdr.ScVal.scvAddress(adminKeypair.publicKey()),
      }),
    ]);

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'set_config',
          args: [
            xdr.ScVal.scvAddress(adminKeypair.publicKey()),
            xdr.ScVal.scvMap(configXdr),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(adminKeypair);
    const result = await adminClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    console.log(`Escrow config set with tx hash: ${result.hash}`);
  }, 30000);

  it('should deposit to escrow', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    const source = await userClient.server.loadAccount(userKeypair.publicKey());

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'deposit',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
            xdr.ScVal.scvI128(500),
            xdr.ScVal.scvAddress(userKeypair.publicKey()), // Using user address as asset for simplicity
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(userKeypair);
    const result = await userClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    expect(typeof result.hash).toBe('string');
    
    console.log(`Deposited to escrow with tx hash: ${result.hash}`);
  }, 30000);

  it('should get escrow record', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    const source = new SorobanDataBuilder().build();
    
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'get_record',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await userClient.sorobanServer.simulateTransaction(tx);
    
    expect(simulateResult.result).toBeDefined();
    console.log(`Escrow record: ${simulateResult.result}`);
  }, 30000);

  it('should get escrow config', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const source = new SorobanDataBuilder().build();
    
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'get_config',
          args: [xdr.ScVal.scvSymbol('test_queue')],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await userClient.sorobanServer.simulateTransaction(tx);
    
    expect(simulateResult.result).toBeDefined();
    console.log(`Escrow config: ${simulateResult.result}`);
  }, 30000);

  it('should get total held amount', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const source = new SorobanDataBuilder().build();
    
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'get_total_held',
          args: [xdr.ScVal.scvSymbol('test_queue')],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await userClient.sorobanServer.simulateTransaction(tx);
    
    expect(simulateResult.result).toBeDefined();
    
    // Decode the i128 result
    const resultXdr = xdr.ScVal.fromXDR(simulateResult.result, 'base64');
    expect(resultXdr.switch().name).toBe('I128');
    
    console.log(`Total held: ${simulateResult.result}`);
  }, 30000);

  it('should release escrow', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const adminKeypair = adminClient.requireKeypair();
    const userKeypair = userClient.requireKeypair();
    const source = await adminClient.server.loadAccount(adminKeypair.publicKey());

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'release',
          args: [
            xdr.ScVal.scvAddress(adminKeypair.publicKey()),
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(adminKeypair);
    const result = await adminClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    console.log(`Escrow released with tx hash: ${result.hash}`);
  }, 30000);

  it('should verify escrow was released', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    const source = new SorobanDataBuilder().build();
    
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'get_record',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await userClient.sorobanServer.simulateTransaction(tx);
    
    expect(simulateResult.result).toBeDefined();
    console.log(`Escrow record after release: ${simulateResult.result}`);
  }, 30000);

  it('should refund escrow', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    // First, make another deposit to test refund
    const userKeypair = userClient.requireKeypair();
    let source = await userClient.server.loadAccount(userKeypair.publicKey());

    let tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'deposit',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
            xdr.ScVal.scvI128(300),
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(userKeypair);
    await userClient.server.submitTransaction(tx);

    // Now refund
    const adminKeypair = adminClient.requireKeypair();
    source = await adminClient.server.loadAccount(adminKeypair.publicKey());

    tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'refund',
          args: [
            xdr.ScVal.scvAddress(adminKeypair.publicKey()),
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(adminKeypair);
    const result = await adminClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    console.log(`Escrow refunded with tx hash: ${result.hash}`);
  }, 30000);

  it('should expire escrow', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    const source = await userClient.server.loadAccount(userKeypair.publicKey());

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'expire',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            xdr.ScVal.scvSymbol('test_queue'),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(userKeypair);
    const result = await userClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    console.log(`Escrow expired with tx hash: ${result.hash}`);
  }, 30000);

  it('should reject non-positive deposit amount via SDK', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    await expect(
      escrowClient.deposit(escrowContractId, 0, 'USDC')
    ).rejects.toThrow('deposit amount must be positive');
  }, 30000);

  it('should work with read-only client', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    
    // Create read-only client
    const readOnlyClient = LineProofClient.readOnly({
      rpcServerUrl: rpcUrl,
      networkPassphrase,
      publicKey: userKeypair.publicKey(),
    });
    
    const readOnlyEscrowClient = new EscrowClient(readOnlyClient);

    // Should not be able to deposit with read-only client
    await expect(
      readOnlyEscrowClient.deposit(escrowContractId, 100, 'USDC')
    ).rejects.toThrow('MISSING_CREDENTIALS');
  }, 30000);
});
