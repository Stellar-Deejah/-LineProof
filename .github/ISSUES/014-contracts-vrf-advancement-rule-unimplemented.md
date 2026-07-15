# [Enhancement] `VerifiableRandomness` advancement rule is an enum variant but has no implementation

**Labels:** `contracts`, `soroban`, `enhancement`, `architecture`
**Difficulty:** Expert

---

## Problem

Three gaps exist around the `AdvancementRule` / verifiable randomness design:

1. **`AdvancementRule.VERIFIABLE_RANDOMNESS` is a dead enum variant**
   `sdk/src/types.ts` defines `AdvancementRule.VERIFIABLE_RANDOMNESS = 'VRF'`. `backend/src/routes/queues.ts` — `CreateQueueSchema` accepts `'VerifiableRandomness'` as a valid `advancementRule`. The `QueueConfig` in `contracts/lineproof-queue/src/lib.rs` has no `advancement_rule` field at all — the queue contract uses an implicit FIFO cursor (`idx`) with no branching for different advancement strategies. The `VerifiableRandomness` value can be stored in queue metadata but is silently ignored at advancement time. There is no VRF oracle, no commitment scheme, and no randomness source wired into `advance()`.

2. **`PRIORITY_TIER` advancement rule also unimplemented**
   Similarly, `AdvancementRule.PRIORITY_TIER = 'PRIORITY'` can be stored but `advance()` always advances positions in order of `position_id` (sequential FIFO). There is no priority weight field on `Position`, no ordering comparison, and no priority-aware batch advancement.

3. **No `advancement_rule` field in `QueueConfig` contract type**
   The contract's `QueueConfig` struct (`lineproof-queue/src/lib.rs`) omits `advancement_rule`. Even FIFO is not explicitly encoded — it is an emergent property of sequential ID assignment. This makes it impossible to audit from on-chain state which rule was used for a given advancement batch. The `QueueDeploymentParams` in `sdk/src/types.ts` includes `advancementRule` and `wasmHash` but neither is passed to the contract during initialization.

**Impact:** Operators and participants believe they are deploying VRF or priority queues based on the SDK type definitions and UI labels, when in practice all queues advance identically (FIFO by position ID). This is a correctness and trust violation. An operator advertising a lottery-style VRF queue is misrepresenting the protocol.

---

## Proposed Solution

**Phase 1 — Encode advancement rule in the contract:**
- Add `advancement_rule: AdvancementRule` to the `QueueConfig` contracttype in `lineproof-queue/src/lib.rs`, where `AdvancementRule` is a new `#[contracttype]` enum with variants `Fifo`, `PriorityTier`, and `VerifiableRandomness`.
- Pass `advancement_rule` from `QueueDeploymentParams` through the SDK `QueueClient` into the contract `initialize()` call.
- Emit the advancement rule in the queue initialization event so it is part of the auditable on-chain record.

**Phase 2 — Implement FIFO explicitly:**
- Refactor `advance()` to check `config.advancement_rule == AdvancementRule::Fifo` and explicitly document that the current sequential-ID behaviour is the FIFO implementation.
- Add a `#[cfg(not(feature = "vrf"))]` gate that panics if `VerifiableRandomness` is set, making the unimplemented path explicit rather than silently falling back to FIFO.

**Phase 3 — Priority tier scaffold:**
- Add an optional `priority_weight: Option<u32>` to the `Position` struct.
- In `enroll_position()`, accept a `priority_weight` parameter when the queue config specifies `PriorityTier`.
- In `advance()`, sort the pending position batch by `priority_weight DESC` before advancing (off-chain sort via SDK or on-chain via a scratch Vec sort) — document the gas implications.

**Phase 4 — VRF design doc:**
- Create `docs/vrf-advancement.md` outlining the planned commit-reveal or oracle-based VRF design, the trust model, and why it is not yet implemented.

---

## Acceptance Criteria

- [ ] `QueueConfig` struct includes `advancement_rule: AdvancementRule` field
- [ ] `AdvancementRule` is a `#[contracttype]` enum with `Fifo`, `PriorityTier`, and `VerifiableRandomness` variants
- [ ] `initialize()` persists the `advancement_rule` from config
- [ ] `advance()` explicitly branches on `advancement_rule`
- [ ] `VerifiableRandomness` advancement panics with `"vrf_not_implemented"` rather than silently using FIFO
- [ ] `PriorityTier` scaffold: `Position.priority_weight` field added, documented as optional
- [ ] SDK `QueueDeploymentParams.advancementRule` is passed into the contract `initialize()` call
- [ ] Frontend `QueueStatusBadge` or a new `AdvancementRuleBadge` component reflects the on-chain rule
- [ ] `docs/vrf-advancement.md` created with design rationale
- [ ] All existing queue contract tests pass with the new struct field added

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain why FIFO-by-position-ID is semantically equivalent to arrival-order FIFO (and any edge cases where it is not, e.g., cancelled positions).
- Describe the chosen sort algorithm for `PriorityTier` and its gas cost implications on Soroban.
- Link to any Stellar/Soroban VRF oracle proposals or prior art used as reference for the Phase 3 design doc.
- Discuss whether `advancement_rule` should be immutable after initialization or upgradeable by the admin.
