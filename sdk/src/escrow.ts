import {
  Operation,
  xdr,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError } from "./types.js";
import { OnRetryFn } from "./utils.js";
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, validateContractId } from './types.js';

export type EscrowClientOptions = {
  contractId?: string;
};
import { Operation, xdr } from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';

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
   * @param onRetry  Optional observer for retry attempts
   */
  async deposit(
    escrowContractId: string,
    amount: number,
    _asset: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    if (amount <= 0) {
      throw new SDKError('INVALID_INPUT', 'deposit amount must be positive');
    }
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        contract: targetId,
        function: 'deposit',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Release escrowed funds. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async release(escrowContractId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
  async release(escrowContractId: string, _identity: string): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        contract: targetId,
        function: 'release',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Refund escrowed funds. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async refund(escrowContractId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
  async refund(escrowContractId: string, _identity: string): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        contract: targetId,
        function: 'refund',
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Expire an escrow. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async expire(escrowContractId: string, identity: string, onRetry?: OnRetryFn): Promise<string> {
  async expire(escrowContractId: string, identity: string): Promise<string> {
    const targetId = escrowContractId || this.contractId || '';
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        contract: targetId,
        function: 'expire',
        args: [xdr.ScVal.scvString(identity)],
      }),
      onRetry,
    );
  }
}