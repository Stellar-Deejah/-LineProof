import {
  Operation,
  xdr,
  scValToNative,
} from '@stellar/stellar-sdk';
import { LineProofClient } from './client.js';
import { SDKError, Position } from './types.js';

export type QueueClientOptions = {
  queueContractId: string;
};

export class QueueClient {
  private readonly queueContractId: string;
  private readonly lineProof: LineProofClient;

  constructor(lineProof: LineProofClient, options: QueueClientOptions) {
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

    return position;
  }

  async advance(batchSize: number): Promise<number[]> {
    const hash = await this.lineProof.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: this.queueContractId,
        function: 'advance',
        args: [xdr.ScVal.scvU32(batchSize)],
      }),
    );
    const resultXdr = await this.lineProof.awaitTransaction(hash);
    const advancedIds = scValToNative(resultXdr) as number[];
    return advancedIds || [];
  }

  async close(): Promise<string> {
    return this.lineProof.submitSorobanOperation(
      Operation.invokeContractFunction({
        contract: this.queueContractId,
        function: 'close',
        args: [],
      }),
    );
  }
}
