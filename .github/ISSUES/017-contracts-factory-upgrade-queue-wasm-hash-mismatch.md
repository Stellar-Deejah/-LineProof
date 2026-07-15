# [Bug] `QueueFactory.upgrade_queue()` updates metadata but does not validate the new wasm hash against the config version bounds

**Labels:** `bug`, `contracts`, `soroban`, `security`
**Difficulty:** Expert

---

## Problem

Three correctness and security gaps exist in the `lineproof-queue-factory` upgrade path:

1. **`upgrade_queue()` version bounds check does not include the current version**
   `contracts/lineproof-queue-factory/src/lib.rs` — `upgrade_queue()` validates that `new_version >= config.min_version && new_version <= config.max_version`. It does not check that `new_version > metadata.version` (the currently deployed version). This allows a factory admin to **downgrade** a deployed queue to an older version. Soroban WASM upgrades are one-way at the ledger level (WASM blobs can be replaced but old ones cannot be rolled back), so permitting a version number decrement is misleading and could allow substituting an older, potentially vulnerable WASM blob behind a version number that appears to be a downgrade.

2. **`upgrade_queue()` does not verify that the `new_wasm_hash` corresponds to `new_version`**
   The factory stores `FactoryConfig.min_version` and `max_version` but has no registry mapping version numbers to approved WASM hashes. An admin can pass any arbitrary `BytesN<32>` as `new_wasm_hash` and any integer as `new_version` — the factory will accept and deploy it as long as the version integer falls within bounds. There is no guarantee that the WASM being deployed is a legitimate LineProof queue contract. A malicious admin could upgrade a queue to arbitrary bytecode.

3. **`deploy_queue()` and `register_queue()` have no duplicate slug check after deactivation**
   `deactivate_queue()` sets `metadata.active = false` but does not remove the metadata from storage. `deploy_queue()` correctly panics with `"queue with this slug already exists"` when a record is present. However, `register_queue()` makes the same check but a deactivated queue occupies its slug permanently — there is no `reuse_deactivated_slug` path and no way to re-deploy under the same slug after deactivation. This creates a slug exhaustion issue in long-lived factory deployments.

**Impact:** A factory admin could silently downgrade a production queue to a vulnerable WASM version. An attacker who compromises an admin key can deploy arbitrary bytecode behind a trusted slug. Long-lived deployments cannot recycle slugs for re-deployed queues.

---

## Proposed Solution

**Downgrade prevention:**
- In `upgrade_queue()`, add `if new_version <= metadata.version { panic!("version must increase") }` before the config bounds check.

**Approved WASM hash registry:**
- Add a `approved_hashes: Map<u32, BytesN<32>>` field to `FactoryConfig`, or maintain a separate `("approved_hash", version)` storage key per version.
- Add `fn register_approved_hash(env, admin, version, wasm_hash)` to the `QueueFactory` trait.
- In `deploy_queue()` and `upgrade_queue()`, verify that the provided `wasm_hash` matches the registered approved hash for the given version. Panic with `"unapproved_wasm_hash"` if not found.

**Slug reuse after deactivation:**
- Add `fn destroy_queue(env, admin, slug)` that removes the metadata record entirely (not just sets `active = false`) and removes the slug from the index.
- Document that `destroy_queue` is irreversible — the slug can then be redeployed.
- Update `deactivate_queue` docs to clarify it is a soft deactivation (no redeployment allowed under same slug).

---

## Acceptance Criteria

- [ ] `upgrade_queue()` panics with `"version must increase"` when `new_version <= metadata.version`
- [ ] Downgrade attempt test added to `lineproof-queue-factory/src/test.rs`
- [ ] `register_approved_hash(env, admin, version, wasm_hash)` function added to factory
- [ ] `deploy_queue()` validates wasm hash against the approved registry if one exists
- [ ] `upgrade_queue()` validates wasm hash against the approved registry
- [ ] `fn destroy_queue(env, admin, slug)` implemented and removes metadata and slug from index
- [ ] Destroyed slug can be re-registered in a subsequent `register_queue()` call
- [ ] All pre-existing factory tests pass with the new constraints applied
- [ ] New tests cover: downgrade rejection, unapproved hash rejection, slug reuse after destroy
- [ ] `cargo test -p lineproof-queue-factory` passes with zero failures

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Explain the threat model: who can call `upgrade_queue()` and under what governance?
- Discuss whether the approved hash registry should be optional (backwards-compatible for deployments that don't use it) or mandatory.
- Show `cargo test -p lineproof-queue-factory -- --nocapture` output.
- Note any implications for the `set_config()` function when `min_version` or `max_version` is narrowed after queues have already been deployed at the old version.
