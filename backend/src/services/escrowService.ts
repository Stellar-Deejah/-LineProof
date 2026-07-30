import { defaultMemoryAdapter, type StorageAdapter } from '../storage/index.js';
import { serviceEmitter } from './eventEmitter.js';

export type EscrowStatus = 'Active' | 'Released' | 'Refunded' | 'Expired';

export type EscrowRecord = {
  id: string;
  queueId: string;
  identity: string;
  amount: bigint;
  asset: string;
  status: EscrowStatus;
  createdAt: string;
  expiresAt: string;
  releasedAt?: string;
};

const NS = 'escrow';
const HOLD_DAYS_DEFAULT = 30;

export interface EscrowService {
  depositEscrow(payload: {
    queueId: string;
    identity: string;
    amount: bigint;
    asset: string;
    holdDays?: number | undefined;
  }): EscrowRecord;
  releaseEscrow(escrowId: string): EscrowRecord | undefined;
  refundEscrow(escrowId: string): EscrowRecord | undefined;
  expireEscrow(escrowId: string): EscrowRecord | undefined;
  getEscrow(escrowId: string): EscrowRecord | undefined;
}

/**
 * Build an escrow service over an injected storage adapter (issue #91). Records
 * live in the `escrow` namespace, keyed by `${queueId}:${identity}`.
 *
 * Pass a fresh adapter (e.g. `new MemoryAdapter()`) in tests for full isolation
 * — no shared module-level state, so tests cannot contaminate each other and
 * run order never changes the result. Production uses the shared default
 * singleton exported below.
 */
export function createEscrowService(store: StorageAdapter = defaultMemoryAdapter): EscrowService {
  const get = (id: string) => store.get<EscrowRecord>(NS, id) as EscrowRecord | undefined;

  const depositEscrow: EscrowService['depositEscrow'] = (payload) => {
    const id = `${payload.queueId}:${payload.identity}`;
    if (get(id) !== undefined) {
      const error = new Error('Duplicate escrow record') as Error & { status: number };
      error.status = 409;
      throw error;
    }
    const createdAt = new Date();
    const holdDays = payload.holdDays ?? HOLD_DAYS_DEFAULT;
    const expiresAt = new Date(createdAt.getTime() + holdDays * 86400_000);
    const record: EscrowRecord = {
      id,
      queueId: payload.queueId,
      identity: payload.identity,
      amount: payload.amount,
      asset: payload.asset,
      status: 'Active',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    store.set<EscrowRecord>(NS, id, record);
    serviceEmitter.emit('escrow.deposited', record);
    return record;
  };

  const transition = (
    escrowId: string,
    next: EscrowStatus,
    event: string,
    guard?: (record: EscrowRecord) => void,
  ): EscrowRecord | undefined => {
    const record = get(escrowId);
    if (!record) return undefined;
    if (record.status !== 'Active') {
      const verb = next === 'Released' ? 'release' : next === 'Refunded' ? 'refund' : 'expire';
      const error = new Error(`Cannot ${verb} escrow in status: ${record.status}`) as Error & { status: number };
      error.status = 409;
      throw error;
    }
    guard?.(record);
    record.status = next;
    record.releasedAt = new Date().toISOString();
    store.set<EscrowRecord>(NS, escrowId, record);
    serviceEmitter.emit(event, record);
    return record;
  };

  return {
    depositEscrow,
    releaseEscrow: (escrowId) => transition(escrowId, 'Released', 'escrow.released'),
    refundEscrow: (escrowId) => transition(escrowId, 'Refunded', 'escrow.refunded'),
    expireEscrow: (escrowId) =>
      transition(escrowId, 'Expired', 'escrow.expired', (record) => {
        if (new Date() < new Date(record.expiresAt)) {
          const error = new Error('Escrow has not yet expired') as Error & { status: number };
          error.status = 422;
          throw error;
        }
      }),
    getEscrow: (escrowId) => get(escrowId),
  };
}

/** Default singleton over the shared adapter — used by production route handlers. */
export const escrowService = createEscrowService();

// Backward-compatible standalone exports bound to the singleton, so existing
// route handlers keep importing `{ depositEscrow, ... }` unchanged.
export const depositEscrow = escrowService.depositEscrow;
export const releaseEscrow = escrowService.releaseEscrow;
export const refundEscrow = escrowService.refundEscrow;
export const expireEscrow = escrowService.expireEscrow;
export const getEscrow = escrowService.getEscrow;
