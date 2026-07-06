import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

export class EnrollmentClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async enroll(queueId: string, _identity: string): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'enroll',
          args: [],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.client.server.submitTransaction(tx);
    return result.hash;
  }

  async cancel(queueId: string, _identity: string): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'cancel',
          args: [],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.client.server.submitTransaction(tx);
    return result.hash;
  }

  async isEnrolled(_queueId: string, _identity: string): Promise<boolean> {
    throw new SDKError(
      'NOT_IMPLEMENTED',
      'isEnrolled requires a bound contract client exposing Soroban RPC',
    );
  }
}
