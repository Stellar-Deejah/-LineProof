import { Networks } from '@stellar/stellar-sdk';
import { LineProofClient, QueueClient, EnrollmentClient, EscrowClient } from '@lineproof/sdk';
import type { BackendConfig } from '../config.js';
import {
  ContractReadUnavailableError,
  type ContractAdapter,
  type OnChainQueue,
  type OnChainEnrollment,
  type OnChainEscrow,
} from './adapter.js';

function passphraseFor(network: string): string {
  switch (network.toUpperCase()) {
    case 'MAINNET':
    case 'PUBLIC':
      return Networks.PUBLIC;
    case 'FUTURENET':
      return (Networks as Record<string, string>)['FUTURENET'] ?? Networks.TESTNET;
    case 'TESTNET':
    default:
      return Networks.TESTNET;
  }
}

/**
 * {@link ContractAdapter} backed by the `@lineproof/sdk` clients.
 *
 * It wires the configured contract IDs into the SDK clients so the read path is
 * ready the moment the SDK gains real Soroban RPC reads. Until then the SDK read
 * methods throw `NOT_IMPLEMENTED` (issues #9 / #14), so each read here surfaces a
 * {@link ContractReadUnavailableError}; the calling route catches it and falls
 * back to local state. Construction performs no network I/O.
 *
 * **Fallback Strategy:**
 * When the Soroban RPC is unreachable, or during the transition period where 
 * SDK methods return `NOT_IMPLEMENTED`, the adapter throws a `ContractReadUnavailableError`.
 * The application's GET routes catch this specific error and seamlessly fall back to 
 * serving the local in-memory/Postgres ephemeral state, ensuring the backend 
 * API remains responsive despite network partition or missing on-chain features.
 */
export class SorobanContractAdapter implements ContractAdapter {
  private readonly lineProof: LineProofClient;
  private readonly config: BackendConfig;

  constructor(config: BackendConfig) {
    this.config = config;
    this.lineProof = new LineProofClient({
      rpcServerUrl: config.sorobanRpcUrl,
      networkPassphrase: passphraseFor(config.stellarNetwork),
    });
  }

  isConfigured(): boolean {
    return this.config.contractsConfigured;
  }

  private requireQueueId(explicit?: string): string {
    const id = explicit ?? this.config.contractIds.queue ?? this.config.contractIds.factory;
    if (!id) {
      throw new ContractReadUnavailableError('No queue or factory contract ID configured');
    }
    return id;
  }

  async getQueue(queueId: string): Promise<OnChainQueue | undefined> {
    const contractId = this.requireQueueId(queueId);
    try {
      // Wires the queue contract into the SDK client. The read itself is not yet
      // available (SDK uses Horizon.Server, not SorobanRpc.Server); this throws
      // NOT_IMPLEMENTED today.
      const queueClient = new QueueClient(this.lineProof, { queueContractId: contractId });
      await queueClient.getPosition(1);
      // Unreachable until the SDK read path lands; shape returned once it does.
      return { id: queueId };
    } catch (err) {
      throw new ContractReadUnavailableError(
        `On-chain queue read unavailable for ${queueId} (SDK read path pending, issues #9/#14)`,
        err,
      );
    }
  }

  async getEnrollmentRecord(queueId: string, identity: string): Promise<OnChainEnrollment | undefined> {
    const contractId = this.requireQueueId(queueId);
    try {
      const enrollmentClient = new EnrollmentClient(this.lineProof);
      await enrollmentClient.isEnrolled(contractId, identity);
      return { queueId, identity, enrolled: false };
    } catch (err) {
      throw new ContractReadUnavailableError(
        `On-chain enrollment read unavailable for ${queueId}/${identity} (issues #9/#14)`,
        err,
      );
    }
  }

  async getEscrowRecord(escrowId: string): Promise<OnChainEscrow | undefined> {
    const contractId = this.config.contractIds.escrow;
    if (!contractId) {
      throw new ContractReadUnavailableError('No escrow contract ID configured');
    }
    // EscrowClient currently exposes writes only; a getEscrowRecord read lands
    // with the SDK read path.
    void EscrowClient;
    throw new ContractReadUnavailableError(
      `On-chain escrow read unavailable for ${escrowId} (SDK read path pending, issues #9/#14)`,
    );
  }
}
