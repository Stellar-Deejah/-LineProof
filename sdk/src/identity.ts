import {
  TransactionBuilder,
  Operation,
  BASE_FEE,
  SorobanRpc,
  xdr,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError } from './types.js';
  SorobanDataBuilder,
  Account,
  SorobanRpc,
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
    // Build a simulation transaction for the view call
    const source = this.client.simulationSource();
    const source = new Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "0",
    );
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.client.getNetworkPassphrase(),
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: queueId,
          function: "is_bound",
          args: [xdr.ScVal.scvString(identity)],
        }),
      )
      .setTimeout(30)
      .build();

    // Simulate the transaction using Soroban RPC
    const simulateResult = await this.client.sorobanServer.simulateTransaction(tx);

    if (!SorobanRpc.Api.isSimulationSuccess(simulateResult) || !simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }

    const resultXdr = simulateResult.result.retval;

    // Parse the boolean result
    if (resultXdr.switch() !== xdr.ScValType.scvBool()) {
      throw new SDKError('INVALID_RESPONSE', 'Expected Bool response from contract');
    const simulateResult =
      await this.client.sorobanServer.simulateTransaction(tx);

    if (
      !SorobanRpc.Api.isSimulationSuccess(simulateResult) ||
      !simulateResult.result
    ) {
      throw new SDKError(
        "SIMULATION_FAILED",
        "Contract simulation returned no result",
      );
    }

    // Decode the XDR result
    const resultXdr = simulateResult.result.retval;

    // Parse the boolean result
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
