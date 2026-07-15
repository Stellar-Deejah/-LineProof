/**
 * Persistence abstraction for LineProof backend services.
 *
 * The backend historically kept all state in module-level `Map`/`Array`
 * stores, so every process restart wiped enrollments, escrow records, and
 * rate-limit counters (issue #4 / #12). `StorageAdapter` is the seam that lets
 * a service talk to a pluggable backing store instead of a raw in-memory Map.
 *
 * Two implementations ship:
 *   - `MemoryAdapter`   — synchronous, in-process, preserves object identity
 *                         (used by default, in tests, and for local dev).
 *   - `PostgresAdapter` — async skeleton for durable, horizontally-scalable
 *                         deployments (selected via `DATABASE_URL`).
 *
 * Methods are typed as {@link Awaitable} so the same interface serves both a
 * synchronous in-memory store and an asynchronous networked store. Callers that
 * only ever use the `MemoryAdapter` can consume the results synchronously;
 * callers that must support Postgres should `await` every call.
 */

/** A value that may be returned directly or as a promise. */
export type Awaitable<T> = T | Promise<T>;

export interface StorageAdapter {
  /** Read a single value by namespace + key. Resolves `undefined` when absent. */
  get<T>(namespace: string, key: string): Awaitable<T | undefined>;

  /** Write (create or overwrite) a value under namespace + key. */
  set<T>(namespace: string, key: string, value: T): Awaitable<void>;

  /** Remove a value. Resolves `true` when a value was deleted, `false` otherwise. */
  delete(namespace: string, key: string): Awaitable<boolean>;

  /** List every value stored under a namespace. */
  list<T>(namespace: string): Awaitable<T[]>;

  /**
   * Atomically add `amount` (default 1) to a numeric counter and return the new
   * value. `ttlMs`, when provided, sets/refreshes an expiry so windowed
   * counters (e.g. rate limits) reset on their own.
   */
  increment(namespace: string, key: string, amount?: number, ttlMs?: number): Awaitable<number>;
}
