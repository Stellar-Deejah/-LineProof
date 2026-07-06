import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

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
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'bind',
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

  async isBound(_queueId: string, _identity: string): Promise<boolean> {
    throw new SDKError('NOT_IMPLEMENTED', 'isBound requires Soroban RPC contract client');
  }

  async recordTransferAttempt(
    from: string,
    to: string,
    _queueId: string,
  ): Promise<void> {
    throw new SDKError(
      'TRANSFER_DISABLED',
      'Transfer attempts are reverted by the protocol',
      { from, to },
    );
  }
}
