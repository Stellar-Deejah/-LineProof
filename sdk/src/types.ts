import { Networks, Keypair, Address as StellarAddress } from '@stellar/stellar-sdk';

export interface LineProofConfig {
  rpcServerUrl: string;
  networkPassphrase: string;
  privateKey?: string;
  publicKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
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
  rpcServerUrl: 'http://localhost:8000/soroban/rpc',
  networkPassphrase: Networks.TESTNET,
  timeoutMs: 30_000,
  maxRetries: 3,
};

export function generateKeypair(): ReturnType<typeof Keypair.random> {
  return Keypair.random();
}

export function validateAddress(address: string): void {
  if (!StellarAddress.isValid(address)) {
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
