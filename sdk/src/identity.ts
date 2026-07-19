import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
  xdr,
  SorobanDataBuilder,
  Account,
  SorobanRpc,
  Address,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError } from "./types.js";

export class IdentityClient {
  private readonly client: LineProofClient;

  constructor(client: LineProofClient) {
    this.client = client;
  }

  async bindIdentity(queueId: string, identity: string): Promise<string> {
    if (!identity || typeof identity !== "string") {
      throw new SDKError("INVALID_IDENTITY", "Identity public key is required");
    }
    const sourceKeypair = this.client.requireKeypair();
    const source = await this.client.server.loadAccount(
      sourceKeypair.publicKey(),
    );
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: "bind",
          args: [],
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    return (await this.client.server.submitTransaction(tx)).hash;
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
