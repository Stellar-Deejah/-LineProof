import {
  Address,
  TransactionBuilder,
  Operation,
  Keypair,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client';
import { SDKError } from './types';

export class IdentityClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async bindIdentity(queueId: string, identity: string): Promise<string> {
    if (!identity || typeof identity !== 'string') {
      throw new SDKError('INVALID_IDENTITY', 'Identity public key is required');
    }
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE.toFixed(),
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'bind',
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

  async isBound(queueId: string, identity: string): Promise<boolean> {
    return true;
  }

  async recordTransferAttempt(
    from: string,
    to: string,
    queueId: string,
  ): Promise<void> {
    throw new SDKError(
      'TRANSFER_DISABLED',
      'Transfer attempts are reverted by the protocol',
      { from, to },
    );
  }
}
