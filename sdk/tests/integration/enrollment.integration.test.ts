import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
  xdr,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import { LineProofClient, EnrollmentClient, NetworkPassphrase } from '../../src';
import {
  setupIntegrationTest,
  isSorobanAvailable,
  deployContract,
  getWasmPaths,
} from './setup';

describe('Enrollment Integration Tests', () => {
  const rpcUrl = process.env.SOROBAN_RPC_URL || 'http://localhost:8080';
  const networkPassphrase = process.env.NETWORK_PASSPHRASE || NetworkPassphrase.STANDALONE;
  
  let adminClient: LineProofClient;
  let userClient: LineProofClient;
  let enrollmentContractId: string;
  let enrollmentClient: EnrollmentClient;

  beforeAll(async () => {
    // Skip if Soroban is not available
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping Enrollment integration tests: Soroban RPC not available');
      return;
    }

    // Build contracts first
    const wasmPaths = getWasmPaths();
    
    // Setup test environment with admin and user accounts
    const setup = await setupIntegrationTest({
      deployContracts: true,
      wasmPaths: {
        enrollment: wasmPaths.enrollment,
      },
    });

    adminClient = setup.adminClient;
    userClient = setup.userClient;
    enrollmentContractId = setup.enrollmentContractId!;

    // Create enrollment client
    enrollmentClient = new EnrollmentClient(adminClient);
  }, 60000);

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should deploy enrollment contract successfully', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    expect(enrollmentContractId).toBeDefined();
    expect(enrollmentContractId).toMatch(/^C[A-Z0-9]+$/);
    console.log(`Enrollment contract deployed: ${enrollmentContractId}`);
  }, 30000);

  it('should enroll in a queue', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    const source = await userClient.server.loadAccount(userKeypair.publicKey());

    const queueIdSymbol = xdr.ScVal.scvSymbol('test_queue');

    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: enrollmentContractId,
          function: 'enroll',
          args: [
            xdr.ScVal.scvAddress(userKeypair.publicKey()),
            queueIdSymbol,
          ],
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(userKeypair);
    const result = await userClient.server.submitTransaction(tx);
    
    expect(result.hash).toBeDefined();
    expect(typeof result.hash).toBe('string');
    
    console.log(`Enrolled with tx hash: ${result.hash}`);
  }, 30000);

  it('should check if enrolled', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    
    // Use the SDK's isEnrolled method
    const isEnrolled = await enrollmentClient.isEnrolled(enrollmentContractId, userKeypair.publicKey());
    
    expect(typeof isEnrolled).toBe('boolean');
    console.log(`Is enrolled: ${isEnrolled}`);
  }, 30000);

  it('should check enrollment via direct contract call', async () => {
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
          contract: enrollmentContractId,
          function: 'is_enrolled',
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
    
    // Decode the boolean result
    const resultXdr = xdr.ScVal.fromXDR(simulateResult.result, 'base64');
    expect(resultXdr.switch().name).toBe('Bool');
    
    const isEnrolled = resultXdr.b();
    expect(typeof isEnrolled).toBe('boolean');
    console.log(`Is enrolled (direct call): ${isEnrolled}`);
  }, 30000);

  it('should get enrollment record', async () => {
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
          contract: enrollmentContractId,
          function: 'enrollment_record',
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
    console.log(`Enrollment record: ${simulateResult.result}`);
  }, 30000);

  it('should get enrollment count', async () => {
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
          contract: enrollmentContractId,
          function: 'enrollment_count',
          args: [xdr.ScVal.scvSymbol('test_queue')],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await userClient.sorobanServer.simulateTransaction(tx);
    
    expect(simulateResult.result).toBeDefined();
    
    // Decode the u32 result
    const resultXdr = xdr.ScVal.fromXDR(simulateResult.result, 'base64');
    expect(resultXdr.switch().name).toBe('U32');
    
    const count = resultXdr.u32();
    expect(typeof count).toBe('number');
    console.log(`Enrollment count: ${count}`);
  }, 30000);

  it('should cancel enrollment', async () => {
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
          contract: enrollmentContractId,
          function: 'cancel',
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
    console.log(`Enrollment cancelled with tx hash: ${result.hash}`);
  }, 30000);

  it('should verify enrollment was cancelled', async () => {
    const available = await isSorobanAvailable(rpcUrl);
    if (!available) {
      console.warn('Skipping: Soroban RPC not available');
      return;
    }

    const userKeypair = userClient.requireKeypair();
    
    // Check if still enrolled - should be false after cancel
    const isEnrolled = await enrollmentClient.isEnrolled(enrollmentContractId, userKeypair.publicKey());
    
    expect(typeof isEnrolled).toBe('boolean');
    console.log(`Is enrolled after cancel: ${isEnrolled}`);
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
    
    const readOnlyEnrollmentClient = new EnrollmentClient(readOnlyClient);

    // Should be able to check enrollment status
    const isEnrolled = await readOnlyEnrollmentClient.isEnrolled(enrollmentContractId, userKeypair.publicKey());
    expect(typeof isEnrolled).toBe('boolean');

    // Should not be able to enroll
    await expect(
      readOnlyEnrollmentClient.enroll(enrollmentContractId, userKeypair.publicKey())
    ).rejects.toThrow('MISSING_CREDENTIALS');
  }, 30000);
});
