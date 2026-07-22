import { Networks, Keypair, StrKey } from '@stellar/stellar-sdk';

export interface LineProofConfig {
  /** Horizon REST endpoint for classic Stellar operations (e.g. https://horizon-testnet.stellar.org). */
  horizonUrl?: string;
  /** Soroban RPC endpoint for contract calls and events (e.g. https://soroban-testnet.stellar.org). */
  sorobanRpcUrl?: string;
  /**
   * @deprecated Use `horizonUrl` and `sorobanRpcUrl` instead. Horizon and
   * Soroban RPC are different endpoints in every real deployment; this field
   * is used as a fallback for whichever of the two is omitted, and using it
   * on its own emits a console warning. It will be removed in a future major
   * version — see docs/sdk-architecture.md for the migration path.
   */
  rpcServerUrl?: string;
  networkPassphrase: string;
  privateKey?: string;
  publicKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  wasmDir?: string;
}

/**
 * Resolves the Horizon and Soroban RPC endpoints from a `LineProofConfig`,
 * falling back to the deprecated `rpcServerUrl` for whichever of the two
 * split fields is missing, and to `defaults` if none of the three are set.
 * Warns once per call when `rpcServerUrl` is the only URL supplied.
 */
export function resolveEndpoints(
  config: Pick<LineProofConfig, 'horizonUrl' | 'sorobanRpcUrl' | 'rpcServerUrl'>,
  defaults: { horizonUrl: string; sorobanRpcUrl: string },
): { horizonUrl: string; sorobanRpcUrl: string } {
  if (config.rpcServerUrl && !config.horizonUrl && !config.sorobanRpcUrl) {
    console.warn(
      '[@lineproof/sdk] `rpcServerUrl` is deprecated and will be removed in a future release. ' +
        'Set `horizonUrl` and `sorobanRpcUrl` explicitly — Horizon and Soroban RPC are different ' +
        'endpoints in every real deployment (e.g. horizon-testnet.stellar.org vs soroban-testnet.stellar.org).',
    );
  }
  return {
    horizonUrl: config.horizonUrl ?? config.rpcServerUrl ?? defaults.horizonUrl,
    sorobanRpcUrl: config.sorobanRpcUrl ?? config.rpcServerUrl ?? defaults.sorobanRpcUrl,
  };
}

/** Convenience enum so callers don't need to import from @stellar/stellar-sdk */
export enum NetworkPassphrase {
  TESTNET = 'Test SDF Network ; September 2015',
  MAINNET = 'Public Global Stellar Network ; September 2015',
  FUTURENET = 'Test SDF Future Network ; October 2022',
  STANDALONE = 'Standalone Network ; February 2017',
}

export interface QueueDeploymentParams {
  slug: string;
  name: string;
  version: number;
  maxPositions: number;
  enrollmentOpenAt: number;
  enrollmentCloseAt: number;
  advancementRule: AdvancementRule;
  escrowRequired: boolean;
  escrowAsset?: string;
  escrowAmountReadable?: number;
  wasmHash?: string;
}

export enum AdvancementRule {
  FIRST_IN_FIRST_OUT = 'FIFO',
  PRIORITY_TIER = 'PRIORITY',
  VERIFIABLE_RANDOMNESS = 'VRF',
}

export enum QueueStatus {
  Draft = 'Draft',
  EnrollmentOpen = 'EnrollmentOpen',
  EnrollmentClosed = 'EnrollmentClosed',
  AdvancementActive = 'AdvancementActive',
  Closed = 'Closed',
}

export enum EscrowStatus {
  Active = 'active',
  Released = 'released',
  Refunded = 'refunded',
  Expired = 'expired',
}

export interface Position {
  positionId: bigint;
  enrolledAt: number;
  identity: string;
  status: PositionStatus;
  advancedAt?: number;
}

export enum PositionStatus {
  Pending = 'pending',
  Advanced = 'advanced',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

export interface QueueMetadata {
  contractId: string;
  slug: string;
  name: string;
  owner: string;
  version: number;
  active: boolean;
  deployedAt: number;
  status?: QueueStatus;
}

export interface EnrollmentRecord {
  queueId: string;
  identity: string;
  enrolledAt: number;
  proofHash: string;
  duplicateCount: number;
  finalized: boolean;
}

export interface EscrowRecord {
  queueId: string;
  identity: string;
  amount: bigint;
  asset: string;
  status: EscrowStatus;
  createdAt: number;
  expiresAt: number;
  releasedAt?: number;
}

export interface LineProofEvent {
  type: string;
  queueSlug: string;
  positionId?: number;
  identity?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export class SDKError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(`[${code}] ${message}`);
    this.name = 'LineProofSDKError';
  }
}

export const DEFAULT_LINEPROOF_CONFIG = {
  horizonUrl: 'http://localhost:8000',
  sorobanRpcUrl: 'http://localhost:8000/soroban/rpc',
  // Local enum, not Networks.TESTNET: a top-level property access on the
  // @stellar/stellar-sdk import would defeat tree-shaking for consumers.
  networkPassphrase: NetworkPassphrase.TESTNET as string,
  timeoutMs: 30_000,
  maxRetries: 3,
};

export function generateKeypair(): ReturnType<typeof Keypair.random> {
  return Keypair.random();
}

export function validateAddress(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new SDKError('INVALID_ADDRESS', `Invalid Stellar address: ${address}`);
  }
}

export function isNetworkPassphrase(network: string): boolean {
  return (
    network === Networks.TESTNET ||
    network === Networks.PUBLIC ||
    network === Networks.STANDALONE ||
    network === (Networks as Record<string, string>)['FUTURENET'] ||
    Object.values(NetworkPassphrase).includes(network as NetworkPassphrase)
  );
}

export function validateContractId(contractId: string): void {
  if (typeof contractId !== 'string' || !contractId.startsWith('C') || contractId.length !== 56) {
    throw new SDKError('INVALID_CONTRACT_ID', `Invalid Stellar contract ID: ${contractId}`);
  }
  if (typeof (StrKey as any).isValidContractId === 'function') {
    if (!(StrKey as any).isValidContractId(contractId)) {
      throw new SDKError('INVALID_CONTRACT_ID', `Invalid Stellar contract ID: ${contractId}`);
    }
  } else if (!/^C[A-Z0-9]{55}$/.test(contractId)) {
    throw new SDKError('INVALID_CONTRACT_ID', `Invalid Stellar contract ID: ${contractId}`);
  }
}

