# [Security] Enrollment proof hash is XOR-folded, not cryptographic — trivially forgeable

**Labels:** `security`, `contracts`, `soroban`
**Difficulty:** Expert

---

## Problem

Three security-relevant gaps exist in the `lineproof-enrollment` and `lineproof-identity` contracts:

1. **`compute_proof_hash` is not a cryptographic hash**
   `contracts/lineproof-enrollment/src/lib.rs` — `EnrollmentImpl::compute_proof_hash()` produces a 32-byte value by XOR-folding the ledger timestamp and ledger sequence number. The comment explicitly states: *"In production this should use env.crypto().sha256() once available."* XOR-fold over a timestamp is not collision-resistant, not preimage-resistant, and not second-preimage-resistant. Two enrollments in the same ledger second will produce the same hash if the sequence is also the same. An adversary who can observe ledger state can trivially predict or reproduce the hash for any enrollment. This `proof_hash` is stored in `EnrollmentRecord.proof_hash` and emitted in the `Enrolled` event — it is the primary integrity anchor for audit reconstruction.

2. **`cancel()` emits a zeroed proof hash**
   The `cancel()` function in `lib.rs` calls `emit(...)` with `[0u8; 32]` as the hash argument. A `Cancelled` event has no link to the original enrollment proof, breaking the audit chain. An auditor cannot verify that a cancellation event corresponds to a specific enrollment record without querying storage directly.

3. **`lineproof-identity` — `can_transfer()` hardcoded stub**
   `contracts/lineproof-identity/src/lib.rs` — `can_transfer()` always returns `false` for any `from != to`, without reading the identity record, checking binding status, or respecting admin overrides. This means the function is not actually enforcing a policy — it is just returning a constant. If any future caller adds a conditional path based on `can_transfer()`, the stub will not protect against transfer attempts.

**Impact:** The entire audit and verification model depends on enrollment proofs being tamper-evident. A weak hash function means the `proof_hash` field is cosmetic, not cryptographic. The missing link from `Cancelled` events to original proofs means cancellation is not auditable. The `can_transfer` stub creates false confidence in transfer prevention.

---

## Proposed Solution

**Proof hash:**
- Replace `compute_proof_hash` with `env.crypto().sha256(preimage)` where `preimage` is a deterministic encoding of `(identity_address_bytes, queue_id_bytes, enrolled_at_u64_be)`. The `soroban-sdk` `Env::crypto().sha256()` is available and produces a proper `BytesN<32>`.
- Remove the timestamp-XOR fallback entirely.

**Cancel audit trail:**
- Store the `proof_hash` from the original `EnrollmentRecord` before removing it, and pass it to `emit()` so the `Cancelled` event includes the original proof hash. This allows auditors to pair cancellations with enrollments by hash.

**`can_transfer` policy:**
- Refactor `can_transfer()` to actually read the `IdentityRecord` for `from`, check that `status != BindingStatus::Revoked`, and check that the queue is in the `queues` binding list.
- Add an admin-override flag (`transfer_allowed: bool`) to `IdentityRecord` or `FactoryConfig` so the contract is not purely hardcoded for production use cases where transfers might be permitted under specific governance rules.

---

## Acceptance Criteria

- [ ] `compute_proof_hash` uses `env.crypto().sha256()` with a deterministic preimage encoding
- [ ] Two enrollments in the same ledger produce different hashes (test: different identities)
- [ ] `cancel()` emits the original `proof_hash` from the enrollment record, not zeros
- [ ] Tests verify the emitted `Cancelled` event hash matches the originally stored `proof_hash`
- [ ] `can_transfer()` reads `IdentityRecord` and checks binding status and queue membership
- [ ] `can_transfer()` returns `false` for a revoked identity regardless of queue membership
- [ ] `can_transfer()` returns `false` when identity is not bound to the specified queue
- [ ] All pre-existing tests in `lineproof-enrollment/test.rs` and `lineproof-identity/test.rs` still pass
- [ ] New tests cover hash determinism, cancel audit trail, and all `can_transfer` branches
- [ ] `cargo test --workspace` passes with zero failures

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Show the new `compute_proof_hash` implementation and explain the preimage encoding format chosen (endianness, padding, field ordering).
- Explain why the original XOR-fold is insufficient and what class of attacks it enables.
- Show test output proving distinct hashes for distinct enrollment inputs.
- Discuss whether the preimage format should be published as a protocol spec in `docs/` so off-chain auditors can recompute hashes independently.
- Note any Soroban SDK version constraints around `env.crypto().sha256()` availability.
