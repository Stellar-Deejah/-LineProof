import {
  Operation,
  BASE_FEE,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";
import { LineProofClient } from "./client.js";
import { SDKError, Position } from "./types.js";
import { OnRetryFn } from "./utils.js";
  xdr,
  scValToNative,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, Position, validateContractId } from './types.js';
import { SDKError, Position } from './types.js';

export type QueueClientOptions = {
  queueContractId: string;
};

export class QueueClient {
  private readonly queueContractId: string;
  private readonly lineProof: LineProofClient;

  constructor(lineProof: LineProofClient, options: QueueClientOptions) {
    if (!options || typeof options.queueContractId !== 'string') {
      throw new SDKError('INVALID_CONTRACT_ID', 'queueContractId is required');
    }
    validateContractId(options.queueContractId);
    this.lineProof = lineProof;
    this.queueContractId = options.queueContractId;
  }

  async getPosition(positionId: number): Promise<Position> {
    if (!Number.isInteger(positionId) || positionId <= 0) {
      throw new SDKError(
        'INVALID_INPUT',
        'positionId must be a positive integer',
      );
    }

    const source = this.lineProof.simulationSource();
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'get_position',
          args: [nativeToScVal(positionId, { type: 'u64' })],
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await this.lineProof.sorobanServer.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(simulateResult) || !simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }

    const resultXdr = simulateResult.result.retval;
    if (resultXdr.switch() !== xdr.ScValType.scvVec()) {
      throw new SDKError('INVALID_RESPONSE', 'Expected Vec response from contract');
    const resultXdr = await this.lineProof.simulateContractCall(
      this.queueContractId,
      'get_position',
      [xdr.ScVal.scvU32(positionId)],
    );

    if (resultXdr.switch() === xdr.ScValType.scvVoid()) {
      throw new SDKError('NOT_FOUND', 'Position not found');
    }

    const parsed = scValToNative(resultXdr) as Record<string, any>;
    if (!parsed) {
      throw new SDKError('INVALID_RESPONSE', 'Failed to parse Position from contract');
    }

    let status = "pending";
    // Soroban enums/symbols can sometimes be parsed as strings or objects.
    let status = 'pending';
    if (parsed.status) {
      if (typeof parsed.status === 'string') {
        status = parsed.status.toLowerCase();
      } else if (parsed.status && parsed.status.tag) {
        status = parsed.status.tag.toLowerCase();
      }
    }

    const position: Position = {
      positionId: BigInt(parsed.position_id?.toString() || positionId),
      enrolledAt: Number(parsed.enrolled_at || 0),
      identity: parsed.identity || '',
      status: status as any,
      ...(parsed.advanced_at ? { advancedAt: Number(parsed.advanced_at) } : {}),
    };
    if (parsed.advanced_at) {
      position.advancedAt = Number(parsed.advanced_at);
    }

    return position;
  }

  /**
   * Advance the queue. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async advance(batchSize: number, onRetry?: OnRetryFn): Promise<number[]> {
  async advance(_batchSize: number): Promise<number[]> {
  async advance(batchSize: number): Promise<number[]> {
    const hash = await this.lineProof.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: this.queueContractId,
        function: 'advance',
        args: [xdr.ScVal.scvU32(batchSize)],
      }),
      onRetry,
    );
    const resultXdr = await this.lineProof.awaitTransaction(hash);
    const advancedIds = scValToNative(resultXdr) as number[];
    return advancedIds || [];
  }

  /**
   * Close the queue. Retries transient failures automatically.
   * @param onRetry  Optional observer for retry attempts
   */
  async close(onRetry?: OnRetryFn): Promise<string> {
    return this.lineProof.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: this.queueContractId,
        function: 'close',
        args: [],
      }),
      onRetry,
    );
  }
}