import {
  Operation,
  xdr,
  Address,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError } from "./types.js";
import { OnRetryFn } from "./utils.js";

export class IdentityClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  /**
   * Bind an identity to a queue. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async bindIdentity(queueId: string, identity: string, onRetry?: OnRetryFn): Promise<string> {
    if (!identity || typeof identity !== "string") {
      throw new SDKError("INVALID_IDENTITY", "Identity public key is required");
    }
    return this.client.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: queueId,
        function: "bind",
        args: [],
      }),
      onRetry,
    );
  }

  async isBound(queueId: string, identity: string): Promise<boolean> {
    const resultXdr = await this.client.simulateContractCall(queueId, "is_bound", [
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

  async recordTransferAttempt(
    from: string,
    to: string,
    _queueId: string,
  ): Promise<void> {
    throw new SDKError(
      "TRANSFER_DISABLED",
      "Transfer attempts are reverted by the protocol",
      { from, to },
    );
  }
}