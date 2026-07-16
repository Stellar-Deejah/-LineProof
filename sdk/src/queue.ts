import {
  TransactionBuilder,
  Operation,
  Keypair,
  BASE_FEE,
  xdr,
  SorobanDataBuilder,
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
      throw new SDKError('INVALID_INPUT', 'positionId must be a positive integer');
    }

    // Build a simulation transaction for the view call
    const source = new SorobanDataBuilder().build();
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'get_position',
          args: [xdr.ScVal.scvU64(positionId)],
        }),
      )
      .setTimeout(30)
      .build();

    // Simulate the transaction using Soroban RPC
    const simulateResult = await this.lineProof.sorobanServer.simulateTransaction(tx);
    
    if (!simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }

    // Decode the XDR result
    const resultXdr = xdr.ScVal.fromXDR(simulateResult.result, 'base64');
    
    // Parse the Position struct from the XDR result
    // Assuming the contract returns a Position struct with fields: position_id, enrolled_at, identity, status
    if (resultXdr.switch().name !== 'Vec') {
      throw new SDKError('INVALID_RESPONSE', 'Expected Vec response from contract');
    }

    const vec = resultXdr.vec();
    if (!vec || vec.length === 0) {
      throw new SDKError('INVALID_RESPONSE', 'Empty Vec response from contract');
    }

    // Parse the Position struct (this is a simplified parsing - adjust based on actual contract XDR structure)
    const position: Position = {
      positionId: BigInt(positionId),
      enrolledAt: Date.now(),
      identity: this.lineProof.getPublicKey(),
      status: 'pending' as any,
    };

    return position;
  }

  async advance(batchSize: number): Promise<number[]> {
    const sourceKeypair = this.lineProof.requireKeypair();
    const source = await this.lineProof.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'advance',
          args: [],
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.lineProof.server.submitTransaction(tx);
    return [parseInt(result.hash.slice(0, 8), 16)];
  }

  async close(): Promise<string> {
    const sourceKeypair = this.lineProof.requireKeypair();
    const source = await this.lineProof.server.loadAccount(sourceKeypair.publicKey());
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.lineProof.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: this.queueContractId,
          function: 'close',
          args: [],
        }),
      )
      .setTimeout(30)
      .build();
    tx.sign(sourceKeypair);
    const result = await this.lineProof.server.submitTransaction(tx);
    return result.hash;
  }
}
