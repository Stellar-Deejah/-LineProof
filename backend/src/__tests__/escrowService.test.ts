import { describe, it, expect, beforeEach } from 'vitest';
import { createEscrowService } from '../services/escrowService.js';
import { MemoryAdapter } from '../storage/memoryAdapter.js';

let svc: ReturnType<typeof createEscrowService>;

beforeEach(() => {
  // Fresh store per test: no shared module state, no ordering effects.
  svc = createEscrowService(new MemoryAdapter());
});

// The escrow store is module-level. We reset all mocks between tests
// to prevent state from leaking. For full isolation, the store would
// need to be injectable — this is tracked in issue #003.

describe('depositEscrow', () => {
  it('creates an Active record', () => {
    const record = svc.depositEscrow({ queueId: 'q-a1', identity: 'alice1', amount: 100, asset: 'XLM' });
    expect(record.status).toBe('Active');
    expect(record.amount).toBe(100);
    expect(record.id).toBe('q-a1:alice1');
  });

  it('throws on duplicate deposit for same queue+identity', () => {
    svc.depositEscrow({ queueId: 'q-b1', identity: 'bob1', amount: 100, asset: 'XLM' });
    expect(() =>
      svc.depositEscrow({ queueId: 'q-b1', identity: 'bob1', amount: 200, asset: 'XLM' })
    ).toThrow('Duplicate escrow record');
  });

  it('sets expiresAt based on holdDays', () => {
    const record = svc.depositEscrow({ queueId: 'q-c1', identity: 'carol1', amount: 50, asset: 'USDC', holdDays: 7 });
    const diff = new Date(record.expiresAt).getTime() - new Date(record.createdAt).getTime();
    expect(diff).toBe(7 * 86400_000);
  });
});

describe('releaseEscrow', () => {
  it('sets status to Released and sets releasedAt', () => {
    svc.depositEscrow({ queueId: 'q-d1', identity: 'dave1', amount: 50, asset: 'USDC' });
    const record = svc.releaseEscrow('q-d1:dave1');
    expect(record?.status).toBe('Released');
    expect(record?.releasedAt).toBeDefined();
  });

  it('throws when trying to release an already-released record', () => {
    svc.depositEscrow({ queueId: 'q-e1', identity: 'eve1', amount: 50, asset: 'USDC' });
    svc.releaseEscrow('q-e1:eve1');
    expect(() => svc.releaseEscrow('q-e1:eve1')).toThrow();
  });

  it('returns undefined when record does not exist', () => {
    expect(svc.releaseEscrow('nonexistent:nobody')).toBeUndefined();
  });
});

describe('refundEscrow', () => {
  it('sets status to Refunded', () => {
    svc.depositEscrow({ queueId: 'q-f1', identity: 'frank1', amount: 75, asset: 'XLM' });
    const record = svc.refundEscrow('q-f1:frank1');
    expect(record?.status).toBe('Refunded');
  });
});

describe('getEscrow', () => {
  it('retrieves an existing record', () => {
    svc.depositEscrow({ queueId: 'q-g1', identity: 'grace1', amount: 200, asset: 'XLM' });
    const record = svc.getEscrow('q-g1:grace1');
    expect(record).toBeDefined();
    expect(record?.identity).toBe('grace1');
  });

  it('returns undefined for a missing record', () => {
    expect(svc.getEscrow('q-h1:nobody')).toBeUndefined();
  });
});
