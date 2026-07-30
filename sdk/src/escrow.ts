import {
  Operation,
  xdr,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, validateContractId } from './types.js';
import { OnRetryFn } from './utils.js';

export type EscrowClientOptions = {
  contractId?: string;
};

export class EscrowClient {
  private readonly client: LineProofClient;
  private readonly contractId?: string;

  constructor(client: LineProofClient, options?: EscrowClientOptions | string) {
    this.client = client;
    if (typeof options === 'string') {
      validateContractId(options);
      this.contractId = options;
    } else if (options?.contractId) {
      validateContractId(options.contractId);
      this.contractId = options.contractId;
    }
  }

  /**
   * Deposit funds into an escrow. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param amount  Amount to deposit
   * @param _asset  Asset code
   * @param onRetry  Optional observer for retry attempts
   */
  async deposit(
    escrowContractId: string,
    amount: number,
    _asset: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    if (amount <= 0) {
      throw new SDKError('INVALID_INPUT', 'deposit amount must be positive');
    }
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'deposit',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Release escrowed funds. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param _identity  User identity
   * @param onRetry  Optional observer for retry attempts
   */
  async release(escrowContractId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'release',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Refund escrowed funds. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param _identity  User identity
   * @param onRetry  Optional observer for retry attempts
   */
  async refund(escrowContractId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'refund',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Expire an escrow. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param identity  User identity
   * @param onRetry  Optional observer for retry attempts
   */
  async expire(escrowContractId: string, identity: string, onRetry?: OnRetryFn): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: 'expire',
        args: [xdr.ScVal.scvString(identity)],
      }),
      onRetry,
    );
  }
}