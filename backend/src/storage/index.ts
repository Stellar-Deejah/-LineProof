import type { StorageAdapter } from './adapter.js';
import { MemoryAdapter } from './memoryAdapter.js';
import { PostgresAdapter } from './postgresAdapter.js';

export type { StorageAdapter, Awaitable } from './adapter.js';
export { MemoryAdapter } from './memoryAdapter.js';
export { PostgresAdapter } from './postgresAdapter.js';

/**
 * Process-wide default adapter. Services that keep a synchronous API (and the
 * rate limiter) share this single `MemoryAdapter` instance so their behaviour
 * is identical to the previous module-level `Map` stores.
 *
 * The default is always `MemoryAdapter`: it is synchronous and never touches
 * the network, so tests and local dev stay deterministic. `createStorageAdapter`
 * is the opt-in path to a durable backend.
 */
export const defaultMemoryAdapter = new MemoryAdapter();

/**
 * Select a storage adapter from configuration.
 *
 * - No `databaseUrl` → the shared in-memory adapter (default behaviour).
 * - `databaseUrl` set → a `PostgresAdapter` (skeleton; see its docs).
 */
export function createStorageAdapter(databaseUrl?: string): StorageAdapter {
  if (databaseUrl && databaseUrl.trim().length > 0) {
    return new PostgresAdapter(databaseUrl.trim());
  }
  return defaultMemoryAdapter;
}
