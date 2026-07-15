# [Bug] Queue status enum mismatch between backend service, frontend types, and contracts causes silent filtering failures

**Labels:** `bug`, `backend`, `frontend`, `api`
**Difficulty:** Advanced

---

## Problem

Three separate layers define `QueueStatus` with incompatible values, causing silent data corruption in the API filter and incorrect badge rendering in the UI:

1. **Backend service uses `'Open'` — contracts use `EnrollmentOpen` / `EnrollmentClosed`**
   `backend/src/services/queueService.ts` defines `type QueueStatus = 'Draft' | 'Open' | 'AdvancementActive' | 'Closed'`. The Soroban contract `lineproof-queue/src/lib.rs` uses `QueueStatus::Draft | EnrollmentOpen | EnrollmentClosed | AdvancementActive | Closed`. The backend fixture queues use `status: 'Open'` which has no contract equivalent — it maps to neither `EnrollmentOpen` nor `EnrollmentClosed`. `GET /api/queues?status=EnrollmentOpen` will always return an empty array because no fixture uses that value.

2. **Frontend `QueueSummary` type bridges both but inconsistently**
   `frontend/src/hooks/useQueues.ts` — `QueueSummary.status` is typed as `'Draft' | 'Open' | 'EnrollmentOpen' | 'EnrollmentClosed' | 'AdvancementActive' | 'Closed'`. The `QueueStatusBadge` component in `frontend/src/components/QueueStatusBadge.tsx` maps these to color classes. Any queue arriving from the backend with `status: 'Open'` will render the `Open` badge, but any queue status received from a real contract (which emits `EnrollmentOpen`) will fail to match and likely fall through to a default/unknown style.

3. **`POST /api/queues` creates queues with `status: 'Draft'` but `advanceQueue()` sets `status: 'AdvancementActive'` directly**
   The `advanceQueue()` function in `queueService.ts` sets `queue.status = 'AdvancementActive'` without transitioning through `EnrollmentClosed`. This skips the intermediate state entirely, meaning a queue can jump from `'Open'` to `'AdvancementActive'` without a `'EnrollmentClosed'` event — violating the contract's enforced state machine which requires `EnrollmentClosed` before `advance()`.

**Impact:** Any feature that filters queues by status (e.g., "show open queues", "show queues ready for advancement") silently returns wrong results. When the backend eventually integrates with on-chain state, all status comparisons will fail. The state machine inconsistency means UI and API behaviour diverges from contract-enforced behaviour.

---

## Proposed Solution

**Canonical enum:**
- Define a single `QueueStatus` enum in `backend/src/schemas/queueStatus.ts` that exactly mirrors the contract values: `Draft | EnrollmentOpen | EnrollmentClosed | AdvancementActive | Closed`.
- Remove `'Open'` from all backend and frontend type definitions.
- Migrate fixture queues in `queueService.ts` to use `'EnrollmentOpen'` where `'Open'` was used.

**Backend state machine enforcement:**
- Add a `transitionQueueStatus(current, next)` helper that validates legal transitions: `Draft → EnrollmentOpen`, `EnrollmentOpen → EnrollmentClosed`, `EnrollmentClosed → AdvancementActive`, `AdvancementActive → Closed`.
- Replace the direct assignment in `advanceQueue()` with this helper; it should throw if the current status does not permit the transition.
- Add `POST /api/queues/:id/open` and `POST /api/queues/:id/close-enrollment` routes that trigger the intermediate transitions.

**Frontend alignment:**
- Remove `'Open'` from `QueueSummary.status` union type in `useQueues.ts`.
- Update `QueueStatusBadge` to handle `EnrollmentOpen` and `EnrollmentClosed` explicitly with appropriate labels (e.g., "Enrolling" and "Enrollment Closed").

---

## Acceptance Criteria

- [ ] `QueueStatus` enum defined canonically in `backend/src/schemas/queueStatus.ts` matching contract values exactly
- [ ] `'Open'` removed from all backend and frontend type definitions
- [ ] Fixture queues in `queueService.ts` use `'EnrollmentOpen'`
- [ ] `advanceQueue()` transitions through `EnrollmentClosed` or throws if skipped
- [ ] `transitionQueueStatus()` helper throws for illegal transitions
- [ ] `GET /api/queues?status=EnrollmentOpen` returns the correct fixture queue
- [ ] `QueueStatusBadge` updated with labels for `EnrollmentOpen` and `EnrollmentClosed`
- [ ] `useQueues.ts` `QueueSummary.status` type updated and `'Open'` removed
- [ ] All existing backend tests updated to use the new status values and still pass
- [ ] TypeScript compilation succeeds with zero errors across `backend/` and `frontend/`

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- List every file that references the `'Open'` status string and confirm each was updated.
- Explain the state transition diagram and why skipping `EnrollmentClosed` before `AdvancementActive` is a correctness violation.
- Show screenshots of the updated `QueueStatusBadge` rendering `EnrollmentOpen` and `EnrollmentClosed` states.
- Discuss whether the status labels should be derived from the enum values (e.g., formatted with a utility function) or hardcoded per variant.
