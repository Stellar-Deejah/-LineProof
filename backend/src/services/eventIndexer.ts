/**
 * Contract event indexing pipeline (issue #31).
 *
 * Polls Soroban RPC `getEvents()` for the five LineProof contract topics,
 * deserializes each event into the typed interfaces from `@lineproof/sdk`
 * (`AnyLineProofEvent`), and persists them through a {@link StorageAdapter} so
 * auditors can rebuild queue history (ARCHITECTURE.md).
 *
 * This is a **scaffold**: the polling loop, cursor tracking, event topics, and
 * persistence shape are all in place, but the actual `SorobanRpc.Server.getEvents`
 * call is stubbed until the SDK exposes a Soroban RPC read path (issues #9 /
 * #29). `fetchRawEvents()` is the single seam to implement then; everything
 * around it (interval, cursor, dedupe, deserialize, store) already works and is
 * unit-testable.
 *
 * Polling vs. streaming: Soroban RPC exposes a pull-based `getEvents` with a
 * ledger cursor, not a push subscription, so polling is the native model. A
 * short interval (default 5s) trades a little latency and RPC load for
 * simplicity and automatic gap-recovery via the persisted cursor; a WebSocket
 * stream would cut latency but needs reconnect/backfill logic the cursor gives
 * us for free. Tune `pollIntervalMs` to the deployment's ledger close time.
 */
import type { EventNamespace, AnyLineProofEvent } from '@lineproof/sdk';
import type { StorageAdapter } from '../storage/adapter.js';
import { defaultMemoryAdapter } from '../storage/index.js';

/** The five contract topics the indexer subscribes to. */
export const CONTRACT_TOPICS: readonly EventNamespace[] = [
  'lineproof.queue',
  'lineproof.enrollment',
  'lineproof.escrow',
  'lineproof.identity',
  'lineproof.factory',
] as const;

export interface EventIndexerOptions {
  /** Storage adapter events are written to. Defaults to the shared in-memory adapter. */
  store?: StorageAdapter;
  /** Poll interval in milliseconds. Default: 5000. */
  pollIntervalMs?: number;
  /** Contract IDs to filter events by (Soroban RPC `getEvents` filter). */
  contractIds?: string[];
  /** Ledger to start indexing from. Default: 0 (from genesis / earliest retained). */
  startLedger?: number;
}

const EVENTS_NS = 'events';
const CURSOR_NS = 'events:cursor';
const CURSOR_KEY = 'lastLedger';

export class EventIndexer {
  private readonly store: StorageAdapter;
  private readonly pollIntervalMs: number;
  private readonly contractIds: string[];
  private readonly startLedger: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(options: EventIndexerOptions = {}) {
    this.store = options.store ?? defaultMemoryAdapter;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.contractIds = options.contractIds ?? [];
    this.startLedger = options.startLedger ?? 0;
  }

  /** Start the polling loop. No-op if already running. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    // Don't keep the process alive solely for polling.
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /** Stop the polling loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Current ledger cursor (last indexed ledger). */
  async cursor(): Promise<number> {
    return (await this.store.get<number>(CURSOR_NS, CURSOR_KEY)) ?? this.startLedger;
  }

  /**
   * Run a single poll cycle: fetch new raw events, deserialize, persist, and
   * advance the cursor. Guarded so overlapping ticks don't double-process.
   */
  async poll(): Promise<AnyLineProofEvent[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const from = await this.cursor();
      const raw = await this.fetchRawEvents(from);
      const events: AnyLineProofEvent[] = [];
      let maxLedger = from;
      for (const item of raw) {
        const event = this.deserialize(item);
        if (!event) continue;
        await this.persist(event);
        events.push(event);
        if (event.ledger > maxLedger) maxLedger = event.ledger;
      }
      if (maxLedger > from) {
        await this.store.set<number>(CURSOR_NS, CURSOR_KEY, maxLedger);
      }
      return events;
    } finally {
      this.running = false;
    }
  }

  /** All indexed events (for a future GET /api/events route). */
  async getIndexedEvents(): Promise<AnyLineProofEvent[]> {
    return this.store.list<AnyLineProofEvent>(EVENTS_NS);
  }

  /**
   * Fetch raw events from Soroban RPC since `fromLedger`.
   *
   * STUB: returns nothing until the SDK exposes `SorobanRpc.Server.getEvents`
   * (issues #9 / #29). Implement here by calling getEvents with
   * `filters: [{ type: 'contract', contractIds: this.contractIds,
   * topics: CONTRACT_TOPICS }]` and a ledger cursor from `fromLedger`.
   */
  protected async fetchRawEvents(fromLedger: number): Promise<unknown[]> {
    void fromLedger;
    void this.contractIds;
    return [];
  }

  /** Map a raw RPC event into a typed {@link AnyLineProofEvent}, or `null` to skip. */
  protected deserialize(raw: unknown): AnyLineProofEvent | null {
    const candidate = raw as Partial<AnyLineProofEvent> | undefined;
    if (
      !candidate ||
      typeof candidate.namespace !== 'string' ||
      !CONTRACT_TOPICS.includes(candidate.namespace as EventNamespace) ||
      typeof candidate.kind !== 'string' ||
      typeof candidate.ledger !== 'number'
    ) {
      return null;
    }
    return candidate as AnyLineProofEvent;
  }

  private async persist(event: AnyLineProofEvent): Promise<void> {
    const key = `${event.ledger}:${event.namespace}:${event.kind}:${event.contractId}`;
    await this.store.set<AnyLineProofEvent>(EVENTS_NS, key, event);
  }
}
