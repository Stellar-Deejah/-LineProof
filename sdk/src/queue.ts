import {
  Address,
  TransactionBuilder,
  Operation,
  Keypair,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient, QueueClient, QueueDeploymentParams } from './client';
import { SDKError } from './types';

export type QueueClientOptions = {
  queueContractId: string;
};

export class QueueClient implements QueueClient {
  private readonly queueContractId: string;
  private readonly lineProof: LineProofClient;

  constructor(lineProof: LineProofClient, options: QueueClientOptions) {
    this.lineProof = lineProof;
    this.queueContractId = options.queueContractId;
  }

  async enroll(identity: Keypair, queueContractId = this.queueContractId): Promise<string> {
    if (!this.lineProof.getPublicKey()) {
      throw new SDKError('MISSING_CREDENTIALS', 'Missing public identity for enrollment');
    }
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof['networkPassphrase'],
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueContractId,
          function: 'enroll',
          args: [identity.publicKey()],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair, identity);
    const txHash = await this.lineProof['server'].submitTransaction(tx);
    return txHash.hash;
  }

  async getPosition(positionId: number): Promise<unknown> {
    if (!Number.isInteger(positionId) || positionId <= 0) {
      throw new SDKError('INVALID_INPUT', 'positionId must be a positive integer');
    }
    // In a production client this would call the queue contract's `get_position`.
    // For the scaffolded version we expose a typed placeholder and surface the API boundary.
    throw new SDKError(
      'NOT_IMPLEMENTED',
      'getPosition requires a bound contract client exposing Soroban RPC',
    );
  }

  async advance(batchSize: number): Promise<number[]> {
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof['networkPassphrase'],
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'advance',
          args: [batchSize],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const txHash = await this.lineProof['server'].submitTransaction(tx);
    return [parseInt(txHash.hash.slice(0, 8), 16)];
  }

  async close(): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof['networkPassphrase'],
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'close',
          args: [],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const txHash = await this.lineProof['server'].submitTransaction(tx);
    return txHash.hash;
  }
}
