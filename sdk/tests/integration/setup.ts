import {
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  xdr,
  Horizon,
} from '@stellar/stellar-sdk';
import { LineProofClient, QueueClient, EnrollmentClient, EscrowClient, IdentityClient, NetworkPassphrase } from '../../src';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface IntegrationTestSetup {
  rpcUrl: string;
  networkPassphrase: string;
  adminKeypair: Keypair;
  userKeypair: Keypair;
  adminClient: LineProofClient;
  userClient: LineProofClient;
  queueContractId?: string;
  enrollmentContractId?: string;
  escrowContractId?: string;
  identityContractId?: string;
  factoryContractId?: string;
}

export interface ContractDeploymentResult {
  contractId: string;
  wasmHash: string;
}

const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'http://localhost:8080';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || NetworkPassphrase.STANDALONE;
const FRIENDBOT_URL = process.env.FRIENDBOT_URL || 'http://localhost:8000/friendbot';

/**
 * Check if the Soroban RPC server is reachable
 */
export async function isSorobanAvailable(rpcUrl: string = SOROBAN_RPC_URL): Promise<boolean> {
  try {
    const server = new SorobanRpc.Server(rpcUrl);
    await server.getHealth();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Fund a test account via friendbot
 */
export async function fundAccount(publicKey: string, friendbotUrl: string = FRIENDBOT_URL): Promise<void> {
  const response = await fetch(`${friendbotUrl}?addr=${publicKey}`);
  if (!response.ok) {
    throw new Error(`Failed to fund account: ${response.statusText}`);
  }
}

/**
 * Create a funded test keypair
 */
export async function createFundedKeypair(): Promise<Keypair> {
  const keypair = Keypair.random();
  await fundAccount(keypair.publicKey());
  // Wait a moment for the funding to be processed
  await new Promise(resolve => setTimeout(resolve, 2000));
  return keypair;
}

/**
 * Upload WASM bytecode to the network
 */
export async function uploadWasm(
  client: LineProofClient,
  wasmBytes: Buffer,
): Promise<string> {
  const keypair = client.requireKeypair();
  const server = client.server;
  
  const account = await server.loadAccount(keypair.publicKey());
  
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeUploadContract(wasmBytes),
        auth: [],
      }),
    )
    .setTimeout(30)
    .build();
  
  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  
  // Extract the wasm hash from the result
  const resultXdr = xdr.TransactionResult.fromXDR(result.resultXdr!, 'base64');
  const wasmHash = Buffer.from(resultXdr.value()[0].value().wasmHash()).toString('hex');
  
  return wasmHash;
}

/**
 * Install a contract from uploaded WASM
 */
export async function installContract(
  client: LineProofClient,
  wasmHash: string,
): Promise<string> {
  const keypair = client.requireKeypair();
  const server = client.server;
  
  const account = await server.loadAccount(keypair.publicKey());
  
  const wasmHashBuffer = Buffer.from(wasmHash, 'hex');
  const contractIdPreimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: xdr.ScAddress.scAddressTypePublicKey(keypair.publicKey()),
      salt: wasmHashBuffer,
    }),
  );
  
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeCreateContract({
          contractIdPreimage,
          executable: xdr.ContractExecutable.contractExecutableWasm(wasmHashBuffer),
        }),
        auth: [],
      }),
    )
    .setTimeout(30)
    .build();
  
  tx.sign(keypair);
  const result = await server.submitTransaction(tx);
  
  // Extract the contract ID from the result
  const resultXdr = xdr.TransactionResult.fromXDR(result.resultXdr!, 'base64');
  const contractId = Buffer.from(resultXdr.value()[0].value().address().contractId()).toString('hex');
  
  // Convert to Stellar address format (C...)
  const contractIdStellar = 'C' + contractId;
  
  return contractIdStellar;
}

/**
 * Deploy a contract (upload WASM and install)
 */
export async function deployContract(
  client: LineProofClient,
  wasmPath: string,
): Promise<ContractDeploymentResult> {
  try {
    const wasmBytes = readFileSync(wasmPath);
    const wasmHash = await uploadWasm(client, wasmBytes);
    const contractId = await installContract(client, wasmHash);
    
    return { contractId, wasmHash };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `WASM file not found at ${wasmPath}. ` +
        'Please build contracts first: cd contracts && cargo build --target wasm32-unknown-unknown --release'
      );
    }
    throw error;
  }
}

/**
 * Wait for transaction to be included in a ledger
 */
export async function waitForTransaction(
  server: SorobanRpc.Server,
  txHash: string,
  timeoutMs: number = 30000,
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await server.getTransaction(txHash);
      if (result.status === 'success') {
        return result;
      }
      if (result.status === 'error') {
        throw new Error(`Transaction failed: ${result.resultXdr}`);
      }
    } catch (error) {
      // Transaction not found yet, continue polling
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Transaction timeout after ${timeoutMs}ms`);
}

/**
 * Setup integration test environment
 * Creates funded accounts and optionally deploys contracts
 */
export async function setupIntegrationTest(
  options: {
    deployContracts?: boolean;
    wasmPaths?: {
      queue?: string;
      enrollment?: string;
      escrow?: string;
      identity?: string;
      factory?: string;
    };
  } = {},
): Promise<IntegrationTestSetup> {
  const available = await isSorobanAvailable();
  if (!available) {
    throw new Error('Soroban RPC is not available. Set SOROBAN_RPC_URL or start the local network.');
  }

  // Create admin and user keypairs
  const adminKeypair = await createFundedKeypair();
  const userKeypair = await createFundedKeypair();

  // Create clients
  const adminClient = new LineProofClient({
    rpcServerUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    privateKey: adminKeypair.secret(),
    publicKey: adminKeypair.publicKey(),
  });

  const userClient = new LineProofClient({
    rpcServerUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    privateKey: userKeypair.secret(),
    publicKey: userKeypair.publicKey(),
  });

  const setup: IntegrationTestSetup = {
    rpcUrl: SOROBAN_RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    adminKeypair,
    userKeypair,
    adminClient,
    userClient,
  };

  // Deploy contracts if requested
  if (options.deployContracts && options.wasmPaths) {
    if (options.wasmPaths.queue) {
      const queueResult = await deployContract(adminClient, options.wasmPaths.queue);
      setup.queueContractId = queueResult.contractId;
    }
    if (options.wasmPaths.enrollment) {
      const enrollmentResult = await deployContract(adminClient, options.wasmPaths.enrollment);
      setup.enrollmentContractId = enrollmentResult.contractId;
    }
    if (options.wasmPaths.escrow) {
      const escrowResult = await deployContract(adminClient, options.wasmPaths.escrow);
      setup.escrowContractId = escrowResult.contractId;
    }
    if (options.wasmPaths.identity) {
      const identityResult = await deployContract(adminClient, options.wasmPaths.identity);
      setup.identityContractId = identityResult.contractId;
    }
    if (options.wasmPaths.factory) {
      const factoryResult = await deployContract(adminClient, options.wasmPaths.factory);
      setup.factoryContractId = factoryResult.contractId;
    }
  }

  return setup;
}

/**
 * Skip integration test if Soroban is not available
 * Use this in test cases to gracefully skip when localnet is not running
 */
export function skipIfNoSoroban(): void {
  const available = isSorobanAvailable();
  if (!available) {
    throw new Error('SKIP: Soroban RPC not available');
  }
}

/**
 * Get WASM file paths for contracts
 * Assumes contracts are built in the standard location
 */
export function getWasmPaths(projectRoot: string = process.cwd()): {
  queue: string;
  enrollment: string;
  escrow: string;
  identity: string;
  factory: string;
} {
  return {
    queue: join(projectRoot, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release', 'lineproof_queue.wasm'),
    enrollment: join(projectRoot, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release', 'lineproof_enrollment.wasm'),
    escrow: join(projectRoot, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release', 'lineproof_escrow.wasm'),
    identity: join(projectRoot, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release', 'lineproof_identity.wasm'),
    factory: join(projectRoot, '..', 'contracts', 'target', 'wasm32-unknown-unknown', 'release', 'lineproof_queue_factory.wasm'),
  };
}
