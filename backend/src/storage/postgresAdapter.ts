import type { StorageAdapter } from './adapter.js';

/**
 * Durable {@link StorageAdapter} backed by PostgreSQL.
 *
 * **Skeleton.** This class fixes the intended shape (constructor takes a
 * connection string; every method is async) and ships with the schema in
 * `backend/src/db/migrations/`, but the query bodies are deferred: wiring them
 * up pulls in a driver (`node-postgres`/`pg` or `drizzle-orm`) and a running
 * database, which belong to the implementation PR rather than this scaffold.
 *
 * **ORM Choice & Schema Details:**
 * We recommend `drizzle-orm` for future implementations due to its edge compatibility
 * and type safety without the heavy runtime of Prisma. The schema (defined in `0001_init.sql`)
 * uses a simple key-value structure with `namespace` and `key` as a composite primary key.
 *
 * Selecting Postgres (`DATABASE_URL` set) therefore throws a clear error today,
 * and the storage factory defaults to `MemoryAdapter` so tests and local dev
 * never touch this path. See `docs/backend-persistence.md` for the rollout plan
 * and the target schema.
 */
export class PostgresAdapter implements StorageAdapter {
  private readonly connectionString: string;

  constructor(connectionString: string) {
    if (!connectionString) {
      throw new Error('PostgresAdapter requires a DATABASE_URL connection string');
    }
    this.connectionString = connectionString;
  }

  /** Redacted connection target, for logging/diagnostics. */
  get target(): string {
    try {
      const url = new URL(this.connectionString);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return '<invalid DATABASE_URL>';
    }
  }

  private notImplemented(method: string): never {
    throw new Error(
      `PostgresAdapter.${method}() is not implemented yet. ` +
        `Apply backend/src/db/migrations and wire node-postgres/drizzle before enabling DATABASE_URL. ` +
        `Target: ${this.target}`,
    );
  }

  async get<T>(namespace: string, key: string): Promise<T | undefined> {
    void namespace;
    void key;
    return this.notImplemented('get');
  }

  async set<T>(namespace: string, key: string, value: T): Promise<void> {
    void namespace;
    void key;
    void value;
    return this.notImplemented('set');
  }

  async delete(namespace: string, key: string): Promise<boolean> {
    void namespace;
    void key;
    return this.notImplemented('delete');
  }

  async list<T>(namespace: string): Promise<T[]> {
    void namespace;
    return this.notImplemented('list');
  }

  async increment(namespace: string, key: string, amount = 1, ttlMs?: number): Promise<number> {
    void namespace;
    void key;
    void amount;
    void ttlMs;
    return this.notImplemented('increment');
  }
}
