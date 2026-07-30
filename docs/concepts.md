# Vocabulary

- **Queue:** An instance of the LineProof system registered by an organization and deployed to Soroban.
- **Position:** A single place in line, assigned non-transferably to a participant.
- **Enrollment:** The act of a participant requesting a position and binding their identity to it.
- **Advancement:** A state transition that moves "Pending" positions closer to or into service.
- **Escrow:** A trust-minimized deposit held by a Soroban contract, releasable by deterministic protocol only.
- **Identity Binding:** The mechanism that ties a queue position to a participant so that it cannot be resold.
- **WASM Hash:** The on-chain hash of the compiled Soroban contract binary, ensuring immutability of published logic.

## Queue slug format (issue #86)

A queue **slug** is its stable, URL-safe identifier. Because contract storage
keys and ids build on Soroban's `Symbol` type — limited to 9 ASCII characters —
an unconstrained slug (e.g. `sneaker-drop-001`, 16 chars) would panic on-chain
with no actionable cause. Slugs are therefore validated at every boundary before
a transaction is built:

- **Shape:** lowercase alphanumeric words joined by single hyphens
  (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), e.g. `sneaker-drop-001`.
- **Length:** 1–64 characters (a `soroban_sdk::String` queue id, well above the
  9-char `Symbol` limit a raw slug would otherwise hit).
- **No** leading/trailing/doubled hyphens, uppercase, spaces, `_`, or `.`.

Enforced by:

- `validateSlug(slug)` in the SDK (`@lineproof/sdk`), called before submitting
  any slug-bearing transaction.
- The backend `CreateQueueSchema` Zod validator, which rejects an invalid slug
  with `400` before it reaches a service or contract.

> **Contract note.** The client and API guards prevent an invalid slug from
> reaching a contract. Migrating the contract storage/id fields from `Symbol` to
> `soroban_sdk::String` (so the on-chain type itself admits the full 64-char
> slug) is the complementary change, tracked with the contract test repair.
