# [Frontend] No UI for enrollment cancellation, escrow management, or position status after enrollment

**Labels:** `frontend`, `enhancement`, `ux`, `api`
**Difficulty:** Advanced

---

## Problem

Three critical post-enrollment user flows are entirely absent from the frontend:

1. **`QueuePage.tsx` — no cancellation UI**
   `frontend/src/pages/QueuePage.tsx` shows a success state after enrollment (`result && !result.conflict`) but provides no way to cancel. The `useEnrollment` hook already exposes a `cancel(queueId, identity)` method that calls `POST /api/enrollments/cancel`, but it is never called from any page or component. A user who enrolled by mistake has no recourse in the UI.

2. **No escrow management UI anywhere in the frontend**
   `frontend/src/hooks/useEscrow.ts` exposes `deposit` and `lookup` but not `release`, `refund`, or status checking. No page displays the escrow status for a queue position. When a queue requires escrow (`queue.escrowAmount > 0` and `queue.escrowAsset`), the enrollment form in `QueuePage` shows the escrow details as static text but never prompts the user to make an escrow deposit or shows whether one exists. The backend routes `POST /api/escrow/deposit` and `GET /api/escrow/:id` are complete and functional.

3. **`DashboardPage.tsx` — enrollment records show no escrow or position status**
   The dashboard's position cards show `queueId`, `enrolledAt`, and `identity` but nothing about whether the position has been advanced, whether escrow is held, or whether the position is cancellable. The `PositionRecord` type in `DashboardPage.tsx` has no `escrow`, `advanced`, or `positionId` fields, even though the backend `enrollmentService` returns `conflict` and `cancelled` already.

**Impact:** Users cannot manage their own queue participation after enrolling. Operators cannot guide participants through the escrow step. The `cancel` functionality built in the backend and SDK has zero surface area in the reference UI.

---

## Proposed Solution

**Cancellation:**
- In `QueuePage.tsx`, replace the static success state with a "Manage position" panel that shows the enrollment details and a **Cancel enrollment** button.
- Wire the button to `useEnrollment().cancel(queueId, identity)`.
- Show a confirmation dialog (or inline confirmation step) before cancelling.

**Escrow UI:**
- Extend `useEscrow` with `release(escrowId)` and `refund(escrowId)` method stubs (view-only for participants — only operators can release/refund, but showing status is valuable).
- Add an `EscrowStatusCard` component that displays the escrow record status (`Active`, `Released`, `Refunded`, `Expired`), amount, asset, and expiry countdown.
- Render `EscrowStatusCard` on `QueuePage` when the queue has `escrowAmount > 0` and the user is enrolled.
- Wire `useEscrow().lookup(escrowId)` to populate the card on load.

**Dashboard enhancements:**
- Extend `PositionRecord` type with optional `escrowStatus`, `positionId`, and `advanced` fields.
- Add a secondary API call in `DashboardPage.lookup()` to `GET /api/escrow/:id` for each enrollment to fetch the escrow status.
- Display a status badge (mirroring `QueueStatusBadge`) for escrow status on each position card.

---

## Acceptance Criteria

- [ ] `QueuePage` shows **Cancel enrollment** button when `result` indicates a successful enrollment
- [ ] Cancel confirmation step prevents accidental cancellation
- [ ] `useEnrollment().cancel()` is called correctly and the UI transitions back to the enrollment form on success
- [ ] `useEscrow` hook extended with `lookupForQueue(queueId, identity)` convenience method
- [ ] `EscrowStatusCard` component created and rendered on `QueuePage` when escrow is required
- [ ] `EscrowStatusCard` shows status, amount, asset, and formatted expiry date
- [ ] `DashboardPage` position cards show escrow status badge when an escrow record exists
- [ ] No TypeScript errors introduced across any modified component or hook
- [ ] Loading and error states handled for all new API calls
- [ ] All new components are keyboard-navigable and have appropriate ARIA labels

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Include screenshots of: the cancellation confirmation flow, the `EscrowStatusCard` in each status state, and the updated dashboard position card.
- Explain the UX decision around who can initiate `release` vs `refund` (operator-only) and why the UI exposes read-only status rather than action buttons for those states.
- Describe how you handled the case where an enrollment exists but no escrow record exists (optional escrow queues).
- Note any race conditions between the enrollment lookup and escrow lookup on the dashboard.
