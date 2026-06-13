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

export class EscrowClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async deposit(escrowContractId: string, amount: number, asset: string): Promise<string> {
    if (amount <= 0) {
      throw new SDKError('INVALID_INPUT', 'deposit amount must be positive');
    }
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE.toFixed(),
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'deposit',
          args: [amount, asset],
          source: sourceKeypair,
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const txHash = await this.client['server'].submitTransaction(tx);
    return txHash.hash;
  }

  async release(escrowContractId: string, identity: string): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE.toFixed(),
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'release',
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

  async refund(escrowContractId: string, identity: string): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(this.client.getPublicKey());
    const source = await this.client['server'].loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE.toFixed(),
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: escrowContractId,
          function: 'refund',
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
}
