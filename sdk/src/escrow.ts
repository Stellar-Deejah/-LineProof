import { TransactionBuilder, Operation, Keypair, BASE_FEE } from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

export class EscrowClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async deposit(escrowContractId: string, amount: number, _asset: string): Promise<string> {
    if (amount <= 0) {
      throw new SDKError('INVALID_INPUT', 'deposit amount must be positive');
    }
    const sourceKeypair = this.client.requireKeypair();
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(Operation.invokeContractFunction({ contract: escrowContractId, function: 'deposit', args: [] }))
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    return (await this.client.server.submitTransaction(tx)).hash;
  }

  async release(escrowContractId: string, _identity: string): Promise<string> {
    const sourceKeypair = this.client.requireKeypair();
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(Operation.invokeContractFunction({ contract: escrowContractId, function: 'release', args: [] }))
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    return (await this.client.server.submitTransaction(tx)).hash;
  }

  async refund(escrowContractId: string, _identity: string): Promise<string> {
    const sourceKeypair = this.client.requireKeypair();
    const source = await this.client.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(Operation.invokeContractFunction({ contract: escrowContractId, function: 'refund', args: [] }))
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    return (await this.client.server.submitTransaction(tx)).hash;
  }
}
