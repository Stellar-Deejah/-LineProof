import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Address,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, validateContractId } from './types.js';

export type IdentityClientOptions = {
  contractId?: string;
};
import { SDKError } from './types.js';

export class IdentityClient {
  private readonly client: LineProofClient;
  private readonly contractId?: string;

  constructor(client: LineProofClient, options?: IdentityClientOptions | string) {
    this.client = client;
    if (typeof options === 'string') {
      validateContractId(options);
      this.contractId = options;
    } else if (options?.contractId) {
      validateContractId(options.contractId);
      this.contractId = options.contractId;
    }
  }

  async bindIdentity(queueId: string, identity: string): Promise<string> {
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    if (!identity || typeof identity !== 'string') {
      throw new SDKError('INVALID_IDENTITY', 'Identity public key is required');
    }
    const sourceKeypair = this.client.requireKeypair();
    const source = await this.client.server.loadAccount(
      sourceKeypair.publicKey(),
    );
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: targetId,
          function: 'bind',
          args: [],
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    return (await this.client.server.submitTransaction(tx)).hash;
  }

  async isBound(queueId: string, identity: string): Promise<boolean> {
    const source = this.client.simulationSource();
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: "is_bound",
          args: [xdr.ScVal.scvString(identity)],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await this.client.sorobanServer.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(simulateResult) || !simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }

    const resultXdr = simulateResult.result.retval;
    if (resultXdr.switch() !== xdr.ScValType.scvBool()) {
      throw new SDKError('INVALID_RESPONSE', 'Expected Bool response from contract');
    }
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    const resultXdr = await this.client.simulateContractCall(targetId, 'is_bound', [
      new Address(identity).toScVal(),
      xdr.ScVal.scvSymbol(targetId),
    ]);

    if (resultXdr.switch().name !== 'scvBool') {
      throw new SDKError(
        'INVALID_RESPONSE',
        'Expected Bool response from contract',
      );
    }

    return resultXdr.b();
  }

  async recordTransferAttempt(
    from: string,
    to: string,
    queueId: string,
  ): Promise<void> {
    const targetId = queueId || this.contractId || '';
    if (targetId) {
      validateContractId(targetId);
    }
    throw new SDKError(
      'TRANSFER_DISABLED',
      'Transfer attempts are reverted by the protocol',
      { from, to },
    );
  }
}
