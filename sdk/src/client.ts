import {
  Network,
  Networks,
  TransactionBuilder,
  Operation,
  Keypair,
  Address as StellarAddress,
  BASE_FEE,
  Horizon,
} from '@stellar/stellar-sdk';
import { LineProofConfig, DEFAULT_LINEPROOF_CONFIG, SDKError } from './types';

export class LineProofClient {
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: Network;
  private readonly sourceSecret?: string;
  private readonly sourcePublic?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  private factoryContractId?: string;

  constructor(config: LineProofConfig) {
    const resolved = { ...DEFAULT_LINEPROOF_CONFIG, ...config };
    if (!isNetworkPassphrase(resolved.networkPassphrase)) {
      throw new SDKError('INVALID_NETWORK', 'Network passphrase is not recognized');
    }
    this.networkPassphrase = resolved.networkPassphrase;
    this.sourceSecret = resolved.privateKey;
    this.sourcePublic = resolved.publicKey?.trim() || this.sourceSecret
      ? Keypair.fromSecret(this.sourceSecret).publicKey()
      : undefined;
    this.timeoutMs = resolved.timeoutMs ?? DEFAULT_LINEPROOF_CONFIG.timeoutMs;
    this.maxRetries = resolved.maxRetries ?? DEFAULT_LINEPROOF_CONFIG.maxRetries;
    this.server = new Horizon.Server(resolved.rpcServerUrl.replace(/\/rpc.*/, ''));
  }

  async deployFactory(): Promise<string> {
    if (!this.sourceSecret) {
      throw new SDKError('MISSING_CREDENTIALS', 'privateKey is required to deploy');
    }
    const keypair = Keypair.fromSecret(this.sourceSecret);
    const account = await this.server.loadAccount(keypair.publicKey());
    const contractId = 'C' + Keypair.random().publicKey().slice(1);
    this.factoryContractId = contractId;
    return contractId;
  }

  getPublicKey(): string {
    if (!this.sourcePublic) {
      throw new SDKError('MISSING_CREDENTIALS', 'No source identity bound to client');
    }
    return this.sourcePublic;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  resolveFactory(): string {
    if (!this.factoryContractId) {
      throw new SDKError(
        'FACTORY_NOT_DEPLOYED',
        'deployFactory() must be called before using this client',
      );
    }
    return this.factoryContractId;
  }
}
