import { describe, it, expect, beforeEach } from 'vitest';

// Re-import the module fresh before each test by isolating module state
// through a simple workaround: reset the internal store via a helper.
// In a real app, inject the store for testability.

let depositEscrow: typeof import('../services/escrowService.js').depositEscrow;
let releaseEscrow: typeof import('../services/escrowService.js').releaseEscrow;
let refundEscrow: typeof import('../services/escrowService.js').refundEscrow;
let expireEscrow: typeof import('../services/escrowService.js').expireEscrow;
let getEscrow: typeof import('../services/escrowService.js').getEscrow;

beforeEach(async () => {
  // Force fresh module to reset in-memory store
  const mod = await import('../services/escrowService.js?t=' + Date.now());
  depositEscrow = mod.depositEscrow;
  releaseEscrow = mod.releaseEscrow;
  refundEscrow = mod.refundEscrow;
  expireEscrow = mod.expireEscrow;
  getEscrow = mod.getEscrow;
});

describe('depositEscrow', () => {
  it('creates an Active record', () => {
    const record = depositEscrow({ queueId: 'q1', identity: 'alice', amount: 100, asset: 'XLM' });
    expect(record.status).toBe('Active');
    expect(record.amount).toBe(100);
    expect(record.id).toBe('q1:alice');
  });

  it('throws 409 on duplicate deposit', () => {
    depositEscrow({ queueId: 'q1', identity: 'bob', amount: 100, asset: 'XLM' });
    expect(() =>
      depositEscrow({ queueId: 'q1', identity: 'bob', amount: 200, asset: 'XLM' })
    ).toThrow('Duplicate escrow record');
  });
});

describe('releaseEscrow', () => {
  it('sets status to Released', () => {
    depositEscrow({ queueId: 'q2', identity: 'carol', amount: 50, asset: 'USDC' });
    const record = releaseEscrow('q2:carol');
    expect(record?.status).toBe('Released');
    expect(record?.releasedAt).toBeDefined();
  });

  it('throws on releasing a non-Active record', () => {
    depositEscrow({ queueId: 'q3', identity: 'dave', amount: 50, asset: 'USDC' });
    releaseEscrow('q3:dave');
    expect(() => releaseEscrow('q3:dave')).toThrow();
  });

  it('returns undefined when record does not exist', () => {
    expect(releaseEscrow('nonexistent')).toBeUndefined();
  });
});

describe('refundEscrow', () => {
  it('sets status to Refunded', () => {
    depositEscrow({ queueId: 'q4', identity: 'eve', amount: 75, asset: 'XLM' });
    const record = refundEscrow('q4:eve');
    expect(record?.status).toBe('Refunded');
  });
});

describe('getEscrow', () => {
  it('retrieves an existing record', () => {
    depositEscrow({ queueId: 'q5', identity: 'frank', amount: 200, asset: 'XLM' });
    const record = getEscrow('q5:frank');
    expect(record).toBeDefined();
    expect(record?.identity).toBe('frank');
  });

  it('returns undefined for missing record', () => {
    expect(getEscrow('q5:nobody')).toBeUndefined();
  });
});
