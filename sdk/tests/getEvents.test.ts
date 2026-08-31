import { describe, it, expect, vi, beforeEach } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { LineProofClient } from '../src/client';
import { NetworkPassphrase } from '../src/types';
import { encodeCursor } from '../src/pagination';

const mockGetEvents = vi.fn();

// vi.mock is hoisted — no top-level variables allowed inside the factory,
// so mockGetEvents is referenced by closure, not destructured here.
vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    Horizon: {
      Server: vi.fn(() => ({})),
    },
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: vi.fn(() => ({
        getEvents: mockGetEvents,
      })),
    },
  };
});

function makeClient(): LineProofClient {
  return new LineProofClient({
    horizonUrl: 'http://localhost:8000',
    sorobanRpcUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: NetworkPassphrase.TESTNET,
  });
}

function rawEvent(topic: xdr.ScVal[], ledger: number, overrides: Record<string, unknown> = {}) {
  return {
    ledger,
    ledgerClosedAt: new Date().toISOString(),
    contractId: 'CTEST',
    id: `${ledger}-0`,
    topic,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetEvents.mockReset();
});

describe('LineProofClient.getEvents', () => {
  it('deserializes RPC events into typed LineProof events', async () => {
    mockGetEvents.mockResolvedValueOnce({
      latestLedger: 100,
      events: [rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('QueueClosed')], 10)],
    });

    const page = await makeClient().getEvents({ limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ namespace: 'lineproof.queue', kind: 'QueueClosed' });
  });

  it('drops events that are not recognized LineProof events', async () => {
    mockGetEvents.mockResolvedValueOnce({
      latestLedger: 100,
      events: [
        rawEvent([xdr.ScVal.scvSymbol('unrelated.contract'), xdr.ScVal.scvSymbol('Whatever')], 10),
        rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('QueueClosed')], 11),
      ],
    });

    const page = await makeClient().getEvents({});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ namespace: 'lineproof.queue' });
  });

  it('filters by namespace when provided', async () => {
    mockGetEvents.mockResolvedValueOnce({
      latestLedger: 100,
      events: [
        rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('QueueClosed')], 10),
        rawEvent([xdr.ScVal.scvSymbol('lineproof.escrow'), xdr.ScVal.scvSymbol('Deposited')], 11),
      ],
    });

    const page = await makeClient().getEvents({ namespaces: ['lineproof.escrow'] });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].namespace).toBe('lineproof.escrow');
  });

  it('passes contractIds through to the RPC filter', async () => {
    mockGetEvents.mockResolvedValueOnce({ latestLedger: 100, events: [] });
    await makeClient().getEvents({ contractIds: ['CQUEUE1'] });
    expect(mockGetEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ contractIds: ['CQUEUE1'] })],
      }),
    );
  });

  it('decodes startLedger from a cursor rather than using the raw startLedger option', async () => {
    mockGetEvents.mockResolvedValueOnce({ latestLedger: 100, events: [] });
    const cursor = encodeCursor(500, 3);
    await makeClient().getEvents({ cursor, startLedger: 1 });
    expect(mockGetEvents).toHaveBeenCalledWith(expect.objectContaining({ startLedger: 500 }));
  });

  it('falls back to startLedger (default 0) when no cursor is given', async () => {
    mockGetEvents.mockResolvedValueOnce({ latestLedger: 100, events: [] });
    await makeClient().getEvents({});
    expect(mockGetEvents).toHaveBeenCalledWith(expect.objectContaining({ startLedger: 0 }));
  });
});

describe('LineProofClient.streamEvents', () => {
  it('polls getEvents on an interval, invokes the callback per event, and stops after unsubscribe', async () => {
    vi.useFakeTimers();
    try {
      mockGetEvents
        .mockResolvedValueOnce({
          latestLedger: 100,
          events: [rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('QueueClosed')], 10)],
        })
        .mockResolvedValue({ latestLedger: 100, events: [] });

      const received: unknown[] = [];
      const unsubscribe = makeClient().streamEvents({}, (event) => received.push(event), 1000);

      await vi.advanceTimersByTimeAsync(0);
      expect(received).toHaveLength(1);

      unsubscribe();
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockGetEvents).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps polling on the same cursor if a poll rejects, instead of stopping the stream', async () => {
    vi.useFakeTimers();
    try {
      mockGetEvents
        .mockRejectedValueOnce(new Error('RPC unavailable'))
        .mockResolvedValueOnce({
          latestLedger: 100,
          events: [rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('QueueClosed')], 10)],
        });

      const received: unknown[] = [];
      const unsubscribe = makeClient().streamEvents({}, (event) => received.push(event), 1000);

      await vi.advanceTimersByTimeAsync(0);
      expect(received).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(received).toHaveLength(1);

      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
