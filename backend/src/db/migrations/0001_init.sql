-- LineProof backend — initial persistence schema (issue #4 / #12)
--
-- Target: PostgresAdapter. Apply with any SQL migration runner, e.g.:
--   psql "$DATABASE_URL" -f backend/src/db/migrations/0001_init.sql
--
-- The generic key/value table backs the StorageAdapter get/set/delete/list
-- surface. The typed tables back the read-optimised query patterns the
-- services use (lookup enrollments by identity or by queue; escrow by id).
-- A migration runner and typed queries land with the PostgresAdapter
-- implementation PR; this file defines the schema they target.

BEGIN;

-- Generic namespaced key/value store (StorageAdapter get/set/delete/list).
CREATE TABLE IF NOT EXISTS kv_store (
  namespace   TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);

-- Namespaced counters (StorageAdapter increment) with optional expiry so
-- windowed counters such as rate limits reset without a sweeper.
CREATE TABLE IF NOT EXISTS kv_counter (
  namespace   TEXT        NOT NULL,
  key         TEXT        NOT NULL,
  value       BIGINT      NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS kv_counter_expires_at_idx ON kv_counter (expires_at);

-- Enrollments. Query patterns: by identity (a user's enrollments) and by
-- queue (a queue's active roster); duplicates are guarded per queue+identity.
CREATE TABLE IF NOT EXISTS enrollments (
  queue_id     TEXT        NOT NULL,
  identity     TEXT        NOT NULL,
  enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  conflict     BOOLEAN     NOT NULL DEFAULT FALSE,
  cancelled    BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (queue_id, identity)
);
CREATE INDEX IF NOT EXISTS enrollments_identity_idx ON enrollments (identity);
CREATE INDEX IF NOT EXISTS enrollments_queue_active_idx ON enrollments (queue_id) WHERE cancelled = FALSE;

-- Escrow records. Query pattern: by escrow id (queue_id:identity).
CREATE TABLE IF NOT EXISTS escrow_records (
  id           TEXT        PRIMARY KEY,
  queue_id     TEXT        NOT NULL,
  identity     TEXT        NOT NULL,
  amount       NUMERIC     NOT NULL,
  asset        TEXT        NOT NULL,
  status       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  released_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS escrow_records_queue_idx ON escrow_records (queue_id);
CREATE INDEX IF NOT EXISTS escrow_records_status_idx ON escrow_records (status);

COMMIT;
