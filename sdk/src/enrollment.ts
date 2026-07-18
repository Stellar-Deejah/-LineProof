import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
  xdr,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

export class EnrollmentClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async enroll(queueId: string, _identity: string): Promise<string> {
    const sourceKeypair = this.client.requireKeypair();
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
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.client.server.submitTransaction(tx);
    return result.hash;
  }

  async cancel(queueId: string, _identity: string): Promise<string> {
    const sourceKeypair = this.client.requireKeypair();
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
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.client.server.submitTransaction(tx);
    return result.hash;
  }

  async isEnrolled(queueId: string, identity: string): Promise<boolean> {
    // Build a simulation transaction for the view call
    const source = new SorobanDataBuilder().build();
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: 'is_enrolled',
          args: [xdr.ScVal.scvString(identity)],
        }),
      )
      .setTimeout(30)
      .build();

    // Simulate the transaction using Soroban RPC
    const simulateResult = await this.client.sorobanServer.simulateTransaction(tx);
    
    if (!simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }

    // Decode the XDR result
    const resultXdr = xdr.ScVal.fromXDR(simulateResult.result, 'base64');
    
    // Parse the boolean result
    if (resultXdr.switch().name !== 'Bool') {
      throw new SDKError('INVALID_RESPONSE', 'Expected Bool response from contract');
    }

    return resultXdr.b();
  }
}
