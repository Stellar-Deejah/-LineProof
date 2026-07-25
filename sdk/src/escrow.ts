import {
  Operation,
  xdr,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError } from "./types.js";
import { OnRetryFn } from "./utils.js";

export class EscrowClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
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
    if (amount <= 0) {
      throw new SDKError("INVALID_INPUT", "deposit amount must be positive");
    }
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: "deposit",
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
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: "release",
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
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: "refund",
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
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: escrowContractId,
        function: "expire",
        args: [xdr.ScVal.scvString(identity)],
      }),
      onRetry,
    );
  }
}