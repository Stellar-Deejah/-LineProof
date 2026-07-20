import {
  Account,
  Keypair,
  Horizon,
  SorobanRpc,
} from '@stellar/stellar-sdk';

// Neutral all-zeros account used as the source for simulation-only (read)
// transactions, where no signature and no real sequence number are needed.
const SIMULATION_ACCOUNT_ID = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
import { LineProofConfig, DEFAULT_LINEPROOF_CONFIG, SDKError, isNetworkPassphrase } from './types.js';
  TransactionBuilder,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import {
  LineProofConfig,
  DEFAULT_LINEPROOF_CONFIG,
  SDKError,
  isNetworkPassphrase,
} from "./types.js";

export class LineProofClient {
  readonly server: Horizon.Server;
  readonly sorobanServer: SorobanRpc.Server;
  readonly networkPassphrase: string;
  private readonly sourceSecret: string | undefined;
  private readonly sourcePublic: string | undefined;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  private factoryContractId?: string;

  constructor(config: LineProofConfig) {
    const resolved = { ...DEFAULT_LINEPROOF_CONFIG, ...config };
    if (!isNetworkPassphrase(resolved.networkPassphrase)) {
      throw new SDKError(
        "INVALID_NETWORK",
        "Network passphrase is not recognized",
      );
    }
    this.networkPassphrase = resolved.networkPassphrase;
    this.sourceSecret = resolved.privateKey;
    this.timeoutMs = resolved.timeoutMs ?? DEFAULT_LINEPROOF_CONFIG.timeoutMs;
    this.maxRetries =
      resolved.maxRetries ?? DEFAULT_LINEPROOF_CONFIG.maxRetries;

    if (resolved.privateKey) {
      this.sourcePublic =
        resolved.publicKey?.trim() ||
        Keypair.fromSecret(resolved.privateKey).publicKey();
    } else {
      this.sourcePublic = resolved.publicKey?.trim();
    }

    // Horizon.Server for classic Stellar operations (strips /rpc path)
    this.server = new Horizon.Server(
      resolved.rpcServerUrl.replace(/\/rpc.*/, ""),
    );
    // SorobanRpc.Server for Soroban contract operations (preserves /rpc path)
    this.sorobanServer = new SorobanRpc.Server(resolved.rpcServerUrl);
  }

  simulationSource(): Account {
    return new Account(this.sourcePublic ?? SIMULATION_ACCOUNT_ID, '0');
  }

  requireKeypair(): Keypair {
    if (!this.sourceSecret) {
      throw new SDKError(
        "MISSING_CREDENTIALS",
        "privateKey is required for this operation. Use LineProofClient.readOnly() for read-only access or provide a privateKey in the config.",
      );
    }
    return Keypair.fromSecret(this.sourceSecret);
  }

  async deployFactory(): Promise<string> {
    const keypair = this.requireKeypair();
    await this.server.loadAccount(keypair.publicKey());
    const contractId = "C" + Keypair.random().publicKey().slice(1);
    this.factoryContractId = contractId;
    return contractId;
  }

  getPublicKey(): string {
    if (!this.sourcePublic) {
      throw new SDKError(
        "MISSING_CREDENTIALS",
        "No source identity bound to client",
      );
    }
    return this.sourcePublic;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  /** Prepare, sign, and submit a Soroban invocation through Soroban RPC. */
  async submitSorobanOperation(
    operation: Parameters<TransactionBuilder["addOperation"]>[0],
  ): Promise<string> {
    const keypair = this.requireKeypair();
    const source = await this.sorobanServer.getAccount(keypair.publicKey());
    const transaction = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
    const prepared = await this.sorobanServer.prepareTransaction(transaction);
    prepared.sign(keypair);
    const result = await this.sorobanServer.sendTransaction(prepared);
    if (result.status === "ERROR") {
      throw new SDKError(
        "TRANSACTION_FAILED",
        "Soroban RPC rejected the transaction",
      );
    }
    return result.hash;
  }

  resolveFactory(): string {
    if (!this.factoryContractId) {
      throw new SDKError(
        "FACTORY_NOT_DEPLOYED",
        "deployFactory() must be called before using this client",
      );
    }
    return this.factoryContractId;
  }

  static readOnly(config: Omit<LineProofConfig, 'privateKey'>): LineProofClient {
    return new LineProofClient(config);
  static readOnly(
    config: Omit<LineProofConfig, "privateKey">,
  ): LineProofClient {
    return new LineProofClient({
      ...config,
      privateKey: undefined,
    });
  }
}
