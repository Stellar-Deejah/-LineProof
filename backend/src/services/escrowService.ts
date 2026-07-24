import { defaultMemoryAdapter } from '../storage/index.js';
import { serviceEmitter } from './eventEmitter.js';

export type EscrowStatus = 'Active' | 'Released' | 'Refunded' | 'Expired';

export type EscrowRecord = {
  id: string;
  queueId: string;
  identity: string;
  amount: number;
  asset: string;
  status: EscrowStatus;
  createdAt: string;
  expiresAt: string;
  releasedAt?: string;
};

// Escrow records live in the shared storage adapter (issue #4), namespace
// `escrow`, keyed by `${queueId}:${identity}`.
const store = defaultMemoryAdapter;
const NS = 'escrow';

const HOLD_DAYS_DEFAULT = 30;

export const depositEscrow = (payload: {
  queueId: string;
  identity: string;
  amount: number;
  asset: string;
  holdDays?: number | undefined;
}): EscrowRecord => {
  const id = `${payload.queueId}:${payload.identity}`;
  if (store.get<EscrowRecord>(NS, id) !== undefined) {
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

export const releaseEscrow = (escrowId: string): EscrowRecord | undefined => {
  const record = store.get<EscrowRecord>(NS, escrowId);
  if (!record) return undefined;
  if (record.status !== 'Active') {
    const error = new Error(`Cannot release escrow in status: ${record.status}`) as Error & { status: number };
    error.status = 409;
    throw error;
  }
  record.status = 'Released';
  record.releasedAt = new Date().toISOString();
  store.set<EscrowRecord>(NS, escrowId, record);
  serviceEmitter.emit('escrow.released', record);
  return record;
};

export const refundEscrow = (escrowId: string): EscrowRecord | undefined => {
  const record = store.get<EscrowRecord>(NS, escrowId);
  if (!record) return undefined;
  if (record.status !== 'Active') {
    const error = new Error(`Cannot refund escrow in status: ${record.status}`) as Error & { status: number };
    error.status = 409;
    throw error;
  }
  record.status = 'Refunded';
  record.releasedAt = new Date().toISOString();
  store.set<EscrowRecord>(NS, escrowId, record);
  serviceEmitter.emit('escrow.refunded', record);
  return record;
};

export const expireEscrow = (escrowId: string): EscrowRecord | undefined => {
  const record = store.get<EscrowRecord>(NS, escrowId);
  if (!record) return undefined;
  if (record.status !== 'Active') {
    const error = new Error(`Cannot expire escrow in status: ${record.status}`) as Error & { status: number };
    error.status = 409;
    throw error;
  }
  const now = new Date();
  if (now < new Date(record.expiresAt)) {
    const error = new Error('Escrow has not yet expired') as Error & { status: number };
    error.status = 422;
    throw error;
  }
  record.status = 'Expired';
  record.releasedAt = now.toISOString();
  store.set<EscrowRecord>(NS, escrowId, record);
  serviceEmitter.emit('escrow.expired', record);
  return record;
};

export const getEscrow = (escrowId: string): EscrowRecord | undefined => {
  return store.get<EscrowRecord>(NS, escrowId);
};
