# Advancement Rules: VRF and PriorityTier

> **NOT YET IMPLEMENTED.** `AdvancementRule::VerifiableRandomness` and
> `AdvancementRule::PriorityTier` are declared in the type model but are **unimplemented
> enum variants** in the deployed contract. Using them will now **panic explicitly**. Every queue 
> using the FIFO rule advances **FIFO by position ID**. This
> document describes the current behaviour and the planned designs so operators
> can assess trust before selecting a non-FIFO rule. Tracked by upstream issue
> **#17** (referenced as "#14" in issue #35 — see the discrepancy note in
> [CHANGELOG.md](../CHANGELOG.md)).

## 1. Current behaviour — FIFO by position ID

The queue contract ([contracts/lineproof-queue/src/lib.rs](../contracts/lineproof-queue/src/lib.rs))
advances positions in strictly ascending `position_id` order, one contiguous
batch at a time:

- `enroll_position()` assigns each enrollee the current `next_id` counter, then
  increments it. Position IDs are therefore dense and monotonic: `1, 2, 3, …`.
- `advance(admin, batch_size)` walks an `idx` cursor from `0`, advancing
  `position_id = idx + 1` while the position is `Pending`, up to `batch_size`
  entries, then persists the new cursor. It requires status
  `EnrollmentClosed` and transitions the queue to `AdvancementActive`.

The `advancement_rule` field is recorded as queue metadata and is **read** by
`advance()`. Selecting `PriorityTier` or `VerifiableRandomness` will cause `advance()` to panic explicitly.

### Why FIFO-by-position-ID may differ from arrival-order FIFO

"FIFO" is easy to misread as "served in the order people arrived." What the
contract actually guarantees is "served in the order the enrollment
transactions were applied to the ledger." Those two orders can diverge:

1. **Ledger ordering is not wall-clock ordering.** Two users who tap "enroll"
   at the same instant get their position IDs from whichever transaction the
   validators include first. Network latency, fee bidding, and mempool
   ordering — not human arrival time — decide who gets the lower ID.
2. **Client retries and resubmissions.** A user whose first submission fails
   (timeout, sequence-number race) and retries lands a later position ID than a
   user who arrived after them but succeeded on the first try.
3. **Batching and relayers.** If enrollments are relayed or batched, the batch
   assembly order — not the original request order — determines position IDs.
4. **No wall-clock tiebreak.** `enrolled_at` is stored (ledger timestamp) but is
   **not** used to reorder advancement; only `position_id` is. Positions sharing
   a ledger timestamp are still ordered purely by the counter.

Operators who need true arrival-order fairness should treat position ID as
"ledger-arrival order" and communicate that to end users, or wait for the VRF
rule below when fairness must not depend on transaction inclusion timing.

## 2. Planned design — PriorityTier

**Goal:** allow queues where some positions advance ahead of others by an
explicit, auditable tier, without letting operators silently reorder individuals.

Sketch:

- Add a `tier: u32` field to `Position` (lower tier advances first; ties broken
  by `position_id` to preserve determinism).
- Tiers are assigned at enrollment from a published, immutable tier policy
  (for example, an eligibility proof presented at `enroll_position`), not by
  post-hoc admin edits.
- `advance()` iterates tier-by-tier: drain tier 0 in position-ID order, then
  tier 1, and so on, still one `batch_size` slice per call.
- Emit the tier on each `Advanced` event so auditors can reconstruct that the
  published policy was followed.

Open questions: how tiers are proven at enrollment, whether tier counts are
capped per queue, and how to prevent tier assignment from becoming a covert
reordering channel.

## 3. Planned design — VerifiableRandomness (VRF)

**Goal:** advance positions in an order that no party (including the operator)
can predict or bias, while remaining publicly verifiable after the fact.

Two candidate approaches are under consideration:

### 3a. Commit–reveal randomness

1. **Commit:** after `close_enrollment`, the admin commits `H(seed)` on-chain.
   The seed is not yet revealed, so it cannot be chosen to target an outcome
   the admin already knows.
2. **Reveal:** the admin reveals `seed`; the contract checks `H(seed)` matches
   the commitment.
3. **Shuffle:** advancement order is a deterministic permutation of the pending
   position IDs seeded by `seed` (for example a Fisher–Yates shuffle keyed by a
   PRNG seeded from `seed`). Anyone can replay the permutation from the revealed
   seed and the on-chain position set.

Trade-off: cheap and fully on-chain, but the committer can still *withhold* the
reveal (griefing). Mitigated with a reveal deadline plus a fallback (for
example, fall back to FIFO, or slash a bond) if the reveal never arrives.

### 3b. Oracle / external VRF

1. Request randomness from an external VRF (a Chainlink-style oracle or a drand
   beacon relayed on-chain).
2. The oracle returns a value plus a proof; the contract verifies the proof
   before using it as the shuffle seed.

Trade-off: no operator withholding risk and stronger unpredictability, but adds
an external dependency, oracle trust assumptions, and per-draw cost.

### Common properties (both approaches)

- The seed is fixed **after** enrollment closes, so the candidate set is frozen
  before randomness is known.
- The permutation is a pure function of `(seed, sorted pending position IDs)`,
  so any observer can independently verify the advancement order.
- Each `Advanced` event carries enough context (seed reference, rank) for
  offline audit.

## 4. Status summary

| Rule | Enum variant | Status | Effective behaviour today |
|------|--------------|--------|---------------------------|
| FIFO | `Fifo` | Implemented | Advance by ascending position ID |
| Priority tier | `PriorityTier` | Not implemented | Explicit panic (`"priority_tier_not_implemented"`) |
| Verifiable randomness | `VerifiableRandomness` | Not implemented | Explicit panic (`"vrf_not_implemented"`) |

Until the rows above change, **do not deploy a queue relying on Priority or VRF
semantics** — the `advance()` call will panic.

## 5. Maintainer review

The planned designs in sections 2–3 describe *intended* behaviour and must be
reviewed by at least one maintainer before they are treated as committed. Record
the review below.

- [ ] Reviewed by maintainer: ______________________ (date: __________)

## References

- Current advancement source: [contracts/lineproof-queue/src/lib.rs](../contracts/lineproof-queue/src/lib.rs)
- Advancement enum: [sdk/src/types.ts](../sdk/src/types.ts) (`AdvancementRule`)
- Storage-expiry caveat that affects any long-lived queue: [docs/contract-storage-ttl.md](contract-storage-ttl.md)
- Changelog tracking entry: [CHANGELOG.md](../CHANGELOG.md) (issue #17)
