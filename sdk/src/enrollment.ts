import {
  Operation,
  Address,
  xdr,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError } from "./types.js";
import { OnRetryFn } from "./utils.js";

export class EnrollmentClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  /**
   * Enroll in a queue. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async enroll(queueId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: queueId,
        function: "enroll",
        args: [],
      }),
      onRetry,
    );
  }

  /**
   * Cancel enrollment. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async cancel(queueId: string, _identity: string, onRetry?: OnRetryFn): Promise<string> {
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: queueId,
        function: "cancel",
        args: [],
      }),
      onRetry,
    );
  }

  async isEnrolled(queueId: string, identity: string): Promise<boolean> {
    const resultXdr = await this.client.simulateContractCall(queueId, "is_enrolled", [
      new Address(identity).toScVal(),
      xdr.ScVal.scvSymbol(queueId),
    ]);

    if (resultXdr.switch().name !== "scvBool") {
      throw new SDKError(
        "INVALID_RESPONSE",
        "Expected Bool response from contract",
      );
    }

    return resultXdr.b();
  }
}