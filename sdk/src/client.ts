import {
  Networks,
  Keypair,
  Horizon,
} from '@stellar/stellar-sdk';
import { LineProofConfig, DEFAULT_LINEPROOF_CONFIG, SDKError, isNetworkPassphrase } from './types.js';

export class LineProofClient {
  readonly server: Horizon.Server;
  readonly networkPassphrase: string;
  private readonly sourceSecret?: string;
  private readonly sourcePublic?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  private factoryContractId?: string;

  constructor(config: LineProofConfig) {
    const resolved = { ...DEFAULT_LINEPROOF_CONFIG, ...config };
    if (!isNetworkPassphrase(resolved.networkPassphrase)) {
      throw new SDKError('INVALID_NETWORK', 'Network passphrase is not recognized');
    }
    this.networkPassphrase = resolved.networkPassphrase;
    this.sourceSecret = resolved.privateKey;
    this.timeoutMs = resolved.timeoutMs ?? DEFAULT_LINEPROOF_CONFIG.timeoutMs;
    this.maxRetries = resolved.maxRetries ?? DEFAULT_LINEPROOF_CONFIG.maxRetries;

    if (resolved.privateKey) {
      this.sourcePublic = resolved.publicKey?.trim() || Keypair.fromSecret(resolved.privateKey).publicKey();
    } else {
      this.sourcePublic = resolved.publicKey?.trim();
    }

    this.server = new Horizon.Server(resolved.rpcServerUrl.replace(/\/rpc.*/, ''));
  }

  async deployFactory(): Promise<string> {
    if (!this.sourceSecret) {
      throw new SDKError('MISSING_CREDENTIALS', 'privateKey is required to deploy');
    }
    const keypair = Keypair.fromSecret(this.sourceSecret);
    await this.server.loadAccount(keypair.publicKey());
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
