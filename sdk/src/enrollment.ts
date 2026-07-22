import {
  Operation,
  Address,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, validateContractId } from './types.js';

export type EnrollmentClientOptions = {
  contractId?: string;
};
import { SDKError } from './types.js';

export class EnrollmentClient {
  private readonly client: LineProofClient;
  private readonly contractId?: string;

  constructor(client: LineProofClient, options?: EnrollmentClientOptions | string) {
    this.client = client;
    if (typeof options === 'string') {
      validateContractId(options);
      this.contractId = options;
    } else if (options?.contractId) {
      validateContractId(options.contractId);
      this.contractId = options.contractId;
    }
  }

  async enroll(queueId: string, _identity: string): Promise<string> {
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'enroll',
        args: [],
      }),
    );
  }

  async cancel(queueId: string, _identity: string): Promise<string> {
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'cancel',
        args: [],
      }),
    );
  }

  async isEnrolled(queueId: string, identity: string): Promise<boolean> {
    const targetId = queueId || this.contractId || '';
    validateContractId(targetId);
    const resultXdr = await this.client.simulateContractCall(targetId, 'is_enrolled', [
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
}
