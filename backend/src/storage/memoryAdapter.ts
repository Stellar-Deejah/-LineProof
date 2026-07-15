import type { StorageAdapter } from './adapter.js';

interface CounterEntry {
  value: number;
  expiresAt?: number;
}

/**
 * In-process {@link StorageAdapter}.
 *
 * Behaviour is intentionally synchronous and reference-preserving: `get()`
 * returns the exact object handed to `set()`, so services that mutate a
 * returned record in place keep working exactly as they did with the previous
 * raw-`Map` stores. This is what lets the existing service unit tests pass
 * unchanged.
 *
 * State lives for the lifetime of the process only — a restart clears it. Use
 * `PostgresAdapter` when durability or multi-replica sharing is required.
 */
export class MemoryAdapter implements StorageAdapter {
  private readonly namespaces = new Map<string, Map<string, unknown>>();
  private readonly counters = new Map<string, Map<string, CounterEntry>>();

  private ns(namespace: string): Map<string, unknown> {
    let bucket = this.namespaces.get(namespace);
    if (!bucket) {
      bucket = new Map<string, unknown>();
      this.namespaces.set(namespace, bucket);
    }
    return bucket;
  }

  private counterNs(namespace: string): Map<string, CounterEntry> {
    let bucket = this.counters.get(namespace);
    if (!bucket) {
      bucket = new Map<string, CounterEntry>();
      this.counters.set(namespace, bucket);
    }
    return bucket;
  }

  get<T>(namespace: string, key: string): T | undefined {
    return this.ns(namespace).get(key) as T | undefined;
  }

  set<T>(namespace: string, key: string, value: T): void {
    this.ns(namespace).set(key, value);
  }

  delete(namespace: string, key: string): boolean {
    return this.ns(namespace).delete(key);
  }

  list<T>(namespace: string): T[] {
    return Array.from(this.ns(namespace).values()) as T[];
  }

  increment(namespace: string, key: string, amount = 1, ttlMs?: number): number {
    const bucket = this.counterNs(namespace);
    const now = Date.now();
    let entry = bucket.get(key);
    if (!entry || (entry.expiresAt !== undefined && now > entry.expiresAt)) {
      entry = { value: 0, expiresAt: ttlMs !== undefined ? now + ttlMs : undefined };
      bucket.set(key, entry);
    }
    entry.value += amount;
    return entry.value;
  }

  /** Test/util helper: read a counter's current expiry (ms epoch), if any. */
  counterExpiry(namespace: string, key: string): number | undefined {
    return this.counterNs(namespace).get(key)?.expiresAt;
  }

  /** Test/util helper: drop everything. Not part of the StorageAdapter contract. */
  reset(): void {
    this.namespaces.clear();
    this.counters.clear();
  }
}
