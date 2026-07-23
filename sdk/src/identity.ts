import {
  Operation,
  xdr,
  Address,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, validateContractId } from './types.js';
import { OnRetryFn } from './utils.js';

export type IdentityClientOptions = {
  contractId?: string;
};

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

  async bindIdentity(queueId: string, identity: string, onRetry?: OnRetryFn): Promise<string> {
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    if (!identity || typeof identity !== 'string') {
      throw new SDKError('INVALID_IDENTITY', 'Identity public key is required');
    }
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'bind',
        args: [],
      }),
      onRetry,
    );
  }

  async isBound(queueId: string, identity: string): Promise<boolean> {
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
