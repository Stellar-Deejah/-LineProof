import { Operation, xdr } from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

export class EscrowClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async deposit(
    escrowContractId: string,
    amount: number,
    _asset: string,
  ): Promise<string> {
    if (amount <= 0) {
      throw new SDKError('INVALID_INPUT', 'deposit amount must be positive');
    }
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: 'deposit',
        args: [],
      }),
    );
  }

  async release(escrowContractId: string, _identity: string): Promise<string> {
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: 'release',
        args: [],
      }),
    );
  }

  async refund(escrowContractId: string, _identity: string): Promise<string> {
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: 'refund',
        args: [],
      }),
    );
  }

  async expire(escrowContractId: string, identity: string): Promise<string> {
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: 'expire',
        args: [xdr.ScVal.scvString(identity)],
      }),
    );
  }
}
