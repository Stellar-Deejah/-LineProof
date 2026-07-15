import { describe, it, expect, beforeEach } from 'vitest';
import type { AnyLineProofEvent } from '@lineproof/sdk';
import { EventIndexer, CONTRACT_TOPICS } from '../services/eventIndexer.js';
import { MemoryAdapter } from '../storage/memoryAdapter.js';

/** Test double that feeds raw events into the pipeline instead of hitting RPC. */
class StubIndexer extends EventIndexer {
  constructor(
    private readonly batches: unknown[][],
    store: MemoryAdapter,
  ) {
    super({ store });
  }

  protected async fetchRawEvents(): Promise<unknown[]> {
    return this.batches.shift() ?? [];
  }
}

function rawEvent(overrides: Partial<AnyLineProofEvent> = {}): Record<string, unknown> {
  return {
    namespace: 'lineproof.enrollment',
    kind: 'Enrolled',
    ledger: 100,
    ledgerClosedAt: '2025-07-01T00:00:00Z',
    contractId: 'CQUEUE',
    data: {},
    ...overrides,
  };
}

describe('EventIndexer', () => {
  let store: MemoryAdapter;

  beforeEach(() => {
    store = new MemoryAdapter();
  });

  it('subscribes to the five contract topics', () => {
    expect([...CONTRACT_TOPICS]).toEqual([
      'lineproof.queue',
      'lineproof.enrollment',
      'lineproof.escrow',
      'lineproof.identity',
      'lineproof.factory',
    ]);
  });

  it('deserializes valid events, persists them, and advances the cursor', async () => {
    const indexer = new StubIndexer([[rawEvent({ ledger: 100 }), rawEvent({ ledger: 105, kind: 'Cancelled' })]], store);
    const events = await indexer.poll();
    expect(events).toHaveLength(2);
    expect(await indexer.cursor()).toBe(105);
    expect(await indexer.getIndexedEvents()).toHaveLength(2);
  });

  it('skips malformed events (unknown namespace, missing fields)', async () => {
    const indexer = new StubIndexer(
      [[rawEvent(), { namespace: 'not.a.topic', kind: 'X', ledger: 1 }, { kind: 'no-namespace' }]],
      store,
    );
    const events = await indexer.poll();
    expect(events).toHaveLength(1);
  });

  it('does not move the cursor backwards when a batch is empty', async () => {
    const indexer = new StubIndexer([[rawEvent({ ledger: 200 })], []], store);
    await indexer.poll();
    expect(await indexer.cursor()).toBe(200);
    await indexer.poll();
    expect(await indexer.cursor()).toBe(200);
  });

  it('default fetchRawEvents returns nothing (stub until SDK RPC read path lands)', async () => {
    const indexer = new EventIndexer({ store });
    expect(await indexer.poll()).toEqual([]);
  });
});
