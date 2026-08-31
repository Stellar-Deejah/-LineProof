import { Operation, xdr } from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError, validateContractId } from "./types.js";
import {
  OnRetryFn,
  encodeScAddress,
  encodeScU64,
  encodeScSymbol,
  assertValidAddress,
} from "./utils.js";

export type EscrowClientOptions = {
  contractId?: string;
};

export class EscrowClient {
  private readonly client: LineProofClient;
  private readonly contractId?: string;

  constructor(client: LineProofClient, options?: EscrowClientOptions | string) {
    this.client = client;
    if (typeof options === "string") {
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
   * @param caller  Caller address
   * @param queueId  Queue ID (used as identifier)
   * @param amount  Amount to deposit
   * @param asset  Asset code
   * @param onRetry  Optional observer for retry attempts
   */
  async deposit(
    escrowContractId: string,
    caller: string,
    queueId: string,
    amount: bigint,
    asset: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    if (amount <= 0n) {
      throw new SDKError("INVALID_INPUT", "deposit amount must be positive");
    }
    const targetId = escrowContractId || this.contractId || "";
    validateContractId(targetId);
    assertValidAddress(caller, "caller");
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "deposit",
        args: [
          encodeScAddress(caller),
          encodeScSymbol(queueId),
          encodeScU64(amount),
          encodeScSymbol(asset),
        ],
      }),
      onRetry,
    );
  }

  /**
   * Release escrowed funds. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param identity  User identity
   * @param queueId  Queue ID (used as identifier)
   * @param onRetry  Optional observer for retry attempts
   */
  async release(
    escrowContractId: string,
    identity: string,
    queueId: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = escrowContractId || this.contractId || "";
    validateContractId(targetId);
    assertValidAddress(identity, "identity");
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "release",
        args: [encodeScAddress(identity), encodeScSymbol(queueId)],
      }),
      onRetry,
    );
  }

  /**
   * Refund escrowed funds. Retries transient failures automatically.
   * @param escrowContractId  Escrow contract ID
   * @param identity  User identity
   * @param queueId  Queue ID (used as identifier)
   * @param onRetry  Optional observer for retry attempts
   */
  async refund(
    escrowContractId: string,
    identity: string,
    queueId: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = escrowContractId || this.contractId || "";
    validateContractId(targetId);
    assertValidAddress(identity, "identity");
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "refund",
        args: [encodeScAddress(identity), encodeScSymbol(queueId)],
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
  async expire(
    escrowContractId: string,
    identity: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = escrowContractId || this.contractId || "";
    validateContractId(targetId);
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "expire",
        args: [xdr.ScVal.scvString(identity)],
      }),
      onRetry,
    );
  }
}
