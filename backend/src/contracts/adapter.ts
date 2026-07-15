/**
 * Read-side bridge from the backend to on-chain contract state (issue #4,
 * phase 3; related: #21).
 *
 * The backend currently duplicates the contract state machine in TypeScript and
 * never reads the real contracts, so the API and chain can permanently diverge.
 * `ContractAdapter` is the seam that lets GET routes prefer authoritative
 * on-chain state, mirroring the read surface of the `@lineproof/sdk` clients.
 */

export interface OnChainQueue {
  id: string;
  slug?: string;
  name?: string;
  status?: string;
  version?: number;
  maxPositions?: number;
  totalEnrolled?: number;
}

export interface OnChainEnrollment {
  queueId: string;
  identity: string;
  enrolled: boolean;
}

export interface OnChainEscrow {
  id: string;
  queueId: string;
  identity: string;
  amount: string;
  status: string;
}

export interface ContractAdapter {
  /** Whether the adapter has enough configuration to attempt on-chain reads. */
  isConfigured(): boolean;

  /** Read a queue's authoritative state, or `undefined` when not found. */
  getQueue(queueId: string): Promise<OnChainQueue | undefined>;

  /** Read whether an identity is enrolled in a queue. */
  getEnrollmentRecord(queueId: string, identity: string): Promise<OnChainEnrollment | undefined>;

  /** Read an escrow record by id. */
  getEscrowRecord(escrowId: string): Promise<OnChainEscrow | undefined>;
}

/**
 * Thrown when the on-chain read path is configured but cannot currently serve a
 * read (e.g. the SDK read path is not implemented yet, or the RPC is
 * unreachable). Callers should catch this and fall back to local state.
 */
export class ContractReadUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ContractReadUnavailableError';
  }
}
