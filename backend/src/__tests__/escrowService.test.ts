import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  depositEscrow,
  releaseEscrow,
  refundEscrow,
  expireEscrow,
  getEscrow,
} from '../services/escrowService.js';

// The escrow store is module-level. We reset all mocks between tests
// to prevent state from leaking. For full isolation, the store would
// need to be injectable — this is tracked in issue #003.
beforeEach(() => {
  vi.resetModules();
});

describe('depositEscrow', () => {
  it('creates an Active record', () => {
    const record = depositEscrow({ queueId: 'q-a1', identity: 'alice1', amount: 100, asset: 'XLM' });
    expect(record.status).toBe('Active');
    expect(record.amount).toBe(100);
    expect(record.id).toBe('q-a1:alice1');
  });

  it('throws on duplicate deposit for same queue+identity', () => {
    depositEscrow({ queueId: 'q-b1', identity: 'bob1', amount: 100, asset: 'XLM' });
    expect(() =>
      depositEscrow({ queueId: 'q-b1', identity: 'bob1', amount: 200, asset: 'XLM' })
    ).toThrow('Duplicate escrow record');
  });

  it('sets expiresAt based on holdDays', () => {
    const record = depositEscrow({ queueId: 'q-c1', identity: 'carol1', amount: 50, asset: 'USDC', holdDays: 7 });
    const diff = new Date(record.expiresAt).getTime() - new Date(record.createdAt).getTime();
    expect(diff).toBe(7 * 86400_000);
  });
});

describe('releaseEscrow', () => {
  it('sets status to Released and sets releasedAt', () => {
    depositEscrow({ queueId: 'q-d1', identity: 'dave1', amount: 50, asset: 'USDC' });
    const record = releaseEscrow('q-d1:dave1');
    expect(record?.status).toBe('Released');
    expect(record?.releasedAt).toBeDefined();
  });

  it('throws when trying to release an already-released record', () => {
    depositEscrow({ queueId: 'q-e1', identity: 'eve1', amount: 50, asset: 'USDC' });
    releaseEscrow('q-e1:eve1');
    expect(() => releaseEscrow('q-e1:eve1')).toThrow();
  });

  it('returns undefined when record does not exist', () => {
    expect(releaseEscrow('nonexistent:nobody')).toBeUndefined();
  });
});

describe('refundEscrow', () => {
  it('sets status to Refunded', () => {
    depositEscrow({ queueId: 'q-f1', identity: 'frank1', amount: 75, asset: 'XLM' });
    const record = refundEscrow('q-f1:frank1');
    expect(record?.status).toBe('Refunded');
  });
});

describe('getEscrow', () => {
  it('retrieves an existing record', () => {
    depositEscrow({ queueId: 'q-g1', identity: 'grace1', amount: 200, asset: 'XLM' });
    const record = getEscrow('q-g1:grace1');
    expect(record).toBeDefined();
    expect(record?.identity).toBe('grace1');
  });

  it('returns undefined for a missing record', () => {
    expect(getEscrow('q-h1:nobody')).toBeUndefined();
  });
});
