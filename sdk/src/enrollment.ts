import { Operation, Address, xdr } from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError, validateContractId } from "./types.js";
import { OnRetryFn, encodeScAddress, assertValidAddress } from "./utils.js";

export type EnrollmentClientOptions = {
  contractId?: string;
};

export class EnrollmentClient {
  private readonly client: LineProofClient;
  private readonly contractId?: string;

  constructor(
    client: LineProofClient,
    options?: EnrollmentClientOptions | string,
  ) {
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
   * Enroll in a queue. Retries transient failures automatically.
   * @param queueId  Queue contract ID
   * @param caller  User caller address (caller's identity)
   * @param onRetry  Optional observer for retry attempts
   */
  async enroll(
    queueId: string,
    caller: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = queueId || this.contractId || "";
    validateContractId(targetId);
    assertValidAddress(caller, "caller");
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "enroll",
        args: [encodeScAddress(caller)],
      }),
      onRetry,
    );
  }

  /**
   * Cancel enrollment. Retries transient failures automatically.
   * @param queueId  Queue contract ID
   * @param caller  User caller address (caller's identity)
   * @param onRetry  Optional observer for retry attempts
   */
  async cancel(
    queueId: string,
    caller: string,
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const targetId = queueId || this.contractId || "";
    validateContractId(targetId);
    assertValidAddress(caller, "caller");
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: targetId,
        function: "cancel",
        args: [encodeScAddress(caller)],
      }),
      onRetry,
    );
  }

  async isEnrolled(queueId: string, identity: string): Promise<boolean> {
    const targetId = queueId || this.contractId || "";
    validateContractId(targetId);
    const resultXdr = await this.client.simulateContractCall(
      targetId,
      "is_enrolled",
      [new Address(identity).toScVal(), xdr.ScVal.scvSymbol(targetId)],
    );
    if (resultXdr.switch().name !== "scvBool") {
      throw new SDKError(
        "INVALID_RESPONSE",
        "Expected Bool response from contract",
      );
    }
    return resultXdr.b();
  }
}
