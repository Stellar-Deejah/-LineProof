import { LineProofClient } from './client';
import { SDKError } from './types';
import {
  Address,
  TransactionBuilder,
  Operation,
  Keypair,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';

export class EnrollmentClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async enroll(queueId: string, identity: string): Promise<string> {
    if (!this.client.getPublicKey()) {
      throw new SDKError('MISSING_CREDENTIALS', 'Client must be initialized with a source keypair');
    }
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'enroll',
          args: [identity],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const txHash = await this.client['server'].submitTransaction(tx);
    return txHash.hash;
  }

  async cancel(queueId: string, identity: string): Promise<string> {
    if (!this.client.getPublicKey()) {
      throw new SDKError('MISSING_CREDENTIALS', 'Client must be initialized with a source keypair');
    }
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'cancel',
          args: [identity],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const txHash = await this.client['server'].submitTransaction(tx);
    return txHash.hash;
  }

  async isEnrolled(queueId: string, identity: string): Promise<boolean> {
    // In a full implementation this queries the enrollment contract storage.
    // The scaffolded version returns a typed placeholder.
    throw new SDKError(
      'NOT_IMPLEMENTED',
      'isEnrolled requires a bound contract client exposing Soroban RPC',
    );
  }
}
