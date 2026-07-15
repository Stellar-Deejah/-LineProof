# Contract Storage TTL (Stub)

> **STUB.** This page is a placeholder created as an acceptance criterion of
> issue #35. Full content is deferred to the dedicated TTL issue (**#26 —
> "No `extend_ttl()` calls in any contract — all persistent storage silently
> expires on Soroban"**). Do not treat this page as complete guidance yet.

## Why this matters

On Soroban, persistent storage entries have a **time-to-live (TTL)**. When an
entry's TTL lapses and is not extended (bumped), the entry is archived and reads
behave as if the data were never written. LineProof contracts store queue
config, positions, enrollment counts, identity bindings, and escrow records in
persistent storage.

None of the current contracts call `extend_ttl()` on their persistent entries.
For a long-lived queue this means state can **silently expire**: a queue that
was enrolled months ago can advance into missing positions, or report zero
enrollments, purely because storage was archived — not because of any protocol
action. This directly undermines the auditability goal in
[ARCHITECTURE.md](../ARCHITECTURE.md) ("auditors should be able to rebuild queue
history from contract storage and events").

## Scope to be documented (deferred to #26)

- Which storage keys each contract writes, and their expected lifetime.
- Where `extend_ttl()` (or `bump`) calls belong for config, positions,
  enrollment counters, identity bindings, and escrow records.
- Recommended TTL thresholds and bump amounts per entry class.
- The interaction between TTL archival and event-based history reconstruction
  (see [docs/observability.md](observability.md) and
  [docs/event-model.md](event-model.md)).
- Operator runbook for detecting and recovering near-expiry entries.

## Related

- Advancement behaviour affected by expiry: [docs/vrf-advancement.md](vrf-advancement.md)
- Tracking: issue #26 (full TTL implementation and documentation)
