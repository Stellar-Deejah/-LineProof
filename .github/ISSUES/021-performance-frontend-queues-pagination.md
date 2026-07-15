# [Performance] `GET /api/queues` returns all queues with no pagination, and `QueuesPage` renders all cards with no virtualization

**Labels:** `performance`, `frontend`, `backend`, `api`
**Difficulty:** Advanced

---

## Problem

Three performance issues compound as the queue registry grows:

1. **`GET /api/queues` has no pagination or cursor**
   `backend/src/routes/queues.ts` — the `GET /` handler returns `mockQueues` (all queues) or a status-filtered subset with no `limit`, `offset`, or cursor parameter. The ARCHITECTURE.md acknowledges: *"Event indexing and pagination need hardening for large queues."* When the backend is connected to on-chain state (issue #018), the `list_queues()` factory function returns `Vec<Symbol>` — every slug in storage — which on Soroban has a practical limit (~100 entries before approaching instruction limits). The API layer must batch these reads and expose cursor-based pagination to prevent both Soroban instruction overruns and large HTTP response bodies.

2. **`QueuesPage.tsx` renders all cards synchronously with no virtualization**
   `frontend/src/pages/QueuesPage.tsx` maps over the full `queues` array with `queues.map((queue) => ...)` and renders every card on every render. With dozens of queues this is imperceptible, but at hundreds of queues (realistic for a production protocol with many operators) this causes layout thrashing, excessive DOM size, and slow scroll performance. There is no lazy loading, infinite scroll, or windowing.

3. **`useQueues` hook fetches on every mount with no caching or SWR-style deduplication**
   Every navigation to `QueuesPage` triggers a fresh `fetch()` with no HTTP cache headers checked, no in-memory cache, and no stale-while-revalidate pattern. If the user navigates away and back quickly (common with React Router navigation), multiple in-flight requests can resolve out of order. The `cancelled` ref prevents a stale state update but the redundant requests still hit the backend.

**Impact:** A production LineProof deployment with a busy queue factory will experience degraded API performance, Soroban instruction limit panics on `list_queues`, slow frontend rendering, and unnecessary network load.

---

## Proposed Solution

**Backend pagination:**
- Add `limit` (default 20, max 100) and `cursor` (opaque, last-seen slug) query parameters to `GET /api/queues`.
- Return a paginated response envelope: `{ items: Queue[], nextCursor: string | null, total: number }`.
- Update the Zod query schema and handler in `queues.ts` to validate and apply the parameters.
- When the Soroban integration (issue #018) is implemented, use the cursor to slice the `Vec<Symbol>` from the factory rather than fetching all slugs.

**Frontend virtualization:**
- Integrate `@tanstack/react-virtual` (or a CSS `content-visibility: auto` approach) for the queue card grid in `QueuesPage.tsx`.
- Implement infinite scroll using an `IntersectionObserver` at the bottom of the list that triggers the next page fetch via `useQueues`.
- Extend `useQueues` to accept a `cursor` argument and append results to existing state rather than replacing.

**Request deduplication:**
- Add a simple in-module cache in `useQueues` with a TTL of 30 seconds. On mount, check the cache first; only fetch if the cache is stale.
- Alternatively, introduce a minimal SWR-like pattern using a shared `Map<string, Promise>` keyed by URL to deduplicate concurrent in-flight requests.

---

## Acceptance Criteria

- [ ] `GET /api/queues` accepts `limit` and `cursor` query parameters
- [ ] Response includes `{ items: Queue[], nextCursor: string | null, total: number }` shape
- [ ] `limit` defaults to 20 and is capped at 100
- [ ] Invalid `limit` or `cursor` values return `400` with a validation message
- [ ] `useQueues` hook updated to support cursor-based pagination
- [ ] `QueuesPage` renders an infinite-scroll list that loads the next page when the user approaches the bottom
- [ ] No more than 20 cards are rendered in the initial viewport
- [ ] Request deduplication: navigating away and back within 30 seconds does not trigger a duplicate fetch
- [ ] `GET /api/queues` backward-compatible (no `limit`/`cursor` params still works, returns first 20)
- [ ] Backend route tests updated to cover paginated responses and cursor handling
- [ ] `QueuesPage` Lighthouse performance score does not regress relative to baseline

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Show the paginated API response shape with a concrete example including `nextCursor`.
- Explain the cursor encoding strategy (e.g., base64-encoded last slug index, opaque token, or offset integer) and justify the choice.
- Include a Lighthouse performance report before and after the virtualization change.
- Discuss the UX trade-off between infinite scroll and traditional page-number pagination for a queue list that may update frequently.
- Note any interaction with the status filter (`?status=EnrollmentOpen`) when pagination is also applied.
