import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

export type QueueClientOptions = {
  queueContractId: string;
};

export class QueueClient {
  private readonly queueContractId: string;
  private readonly lineProof: LineProofClient;

  constructor(lineProof: LineProofClient, options: QueueClientOptions) {
    this.lineProof = lineProof;
    this.queueContractId = options.queueContractId;
  }

  async enroll(identity: Keypair, queueContractId = this.queueContractId): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueContractId,
          function: 'enroll',
          args: [],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair, identity);
    const result = await this.lineProof.server.submitTransaction(tx);
    return result.hash;
  }

  async getPosition(positionId: number): Promise<unknown> {
    if (!Number.isInteger(positionId) || positionId <= 0) {
      throw new SDKError('INVALID_INPUT', 'positionId must be a positive integer');
    }
    throw new SDKError(
      'NOT_IMPLEMENTED',
      'getPosition requires a bound contract client exposing Soroban RPC',
    );
  }

  async advance(batchSize: number): Promise<number[]> {
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'advance',
          args: [],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.lineProof.server.submitTransaction(tx);
    return [parseInt(result.hash.slice(0, 8), 16)];
  }

  async close(): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.lineProof.getPublicKey());
    const source = await this.lineProof.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
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
    const result = await this.lineProof.server.submitTransaction(tx);
    return result.hash;
  }
}
