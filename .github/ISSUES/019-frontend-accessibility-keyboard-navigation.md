# [Accessibility] Tooltip lacks `aria-describedby` wiring, and interactive elements across pages miss focus management

**Labels:** `accessibility`, `frontend`, `enhancement`
**Difficulty:** Advanced

---

## Problem

Three accessibility gaps affect keyboard-only and screen-reader users across the frontend:

1. **`Tooltip.tsx` — `role="tooltip"` not wired to the trigger via `aria-describedby`**
   `frontend/src/components/Tooltip.tsx` renders a `<span role="tooltip">` but the outer wrapper element has no `id` and the trigger has no `aria-describedby` pointing to it. Per WCAG 1.3.1 (Info and Relationships) and ARIA authoring practices, a tooltip must be associated with its trigger via `aria-describedby`. Without this, screen readers (NVDA, VoiceOver) will announce the children but not the tooltip content when the trigger receives focus. The tooltip is also conditionally rendered (`{visible && <span>...`), which means the ARIA target does not exist in the DOM when not visible — the `aria-describedby` reference would be broken. The correct pattern is to keep the tooltip always in the DOM and toggle `visibility` or use `hidden` attribute.

2. **`QueuePage.tsx` and `DashboardPage.tsx` — form submission errors not announced to screen readers**
   Error messages rendered by `{(inputError || enrollError) && <p className="text-sm text-red-600">...</p>}` have no `role="alert"` or `aria-live="polite"`. When an error appears after form submission, a screen reader user receives no announcement. Similarly, the success message after enrollment (`Enrolled successfully...`) is rendered into the DOM without an `aria-live` region.

3. **`QueuesPage.tsx` — queue cards are `<Link>` elements with no `aria-label`**
   Each queue card in `frontend/src/pages/QueuesPage.tsx` is a `<Link to={...}>` that wraps a heading, description, progress bar, and a `<span>View</span>` text. Screen readers will read the entire card content as the link label, including the progress bar percentage text. There is no concise `aria-label` on the link. The `ProgressBar` component uses `role="progressbar"` correctly, but when embedded inside a link, VoiceOver on iOS reads it as part of the interactive element in a confusing way.

**Impact:** LineProof is described as a protocol for fair access — the irony of the reference UI being inaccessible is significant. Operators building on this reference will inherit these patterns. WCAG 2.1 AA compliance requires all of these to be addressed.

---

## Proposed Solution

**Tooltip fix:**
- Assign a stable `id` to the tooltip content span (e.g., using `React.useId()` introduced in React 18).
- Add `aria-describedby={tooltipId}` to the trigger wrapper.
- Move the tooltip span out of the conditional and use `hidden` attribute (`hidden={!visible}`) to keep it in the DOM at all times.
- Add `aria-expanded` or `aria-hidden` as appropriate to signal visibility to AT.

**Alert regions:**
- Wrap all form error `<p>` elements in a `<div role="alert" aria-live="assertive">` (for errors) or `<div role="status" aria-live="polite">` (for success messages) in `QueuePage.tsx` and `DashboardPage.tsx`.
- Extract a reusable `LiveRegion` component to standardize this pattern.

**Queue card links:**
- Add `aria-label={queue.name}` to each `<Link>` in `QueuesPage.tsx` to provide a concise, non-redundant link label.
- Move the `ProgressBar` outside the `<Link>` or add `aria-hidden="true"` to it within the link context so the progress value is not read as part of the interactive link label.

---

## Acceptance Criteria

- [ ] `Tooltip` assigns a stable `id` to the tooltip span using `React.useId()`
- [ ] Trigger element has `aria-describedby` pointing to the tooltip `id`
- [ ] Tooltip span remains in the DOM with `hidden` attribute when not visible (never conditionally unmounted)
- [ ] Screen reader test (or axe-core automated scan) confirms tooltip association is correct
- [ ] `QueuePage.tsx` enrollment error and success messages wrapped in appropriate `role="alert"` / `role="status"` regions
- [ ] `DashboardPage.tsx` lookup error wrapped in `role="alert"` region
- [ ] `LiveRegion` reusable component created in `frontend/src/components/LiveRegion.tsx`
- [ ] Queue card links in `QueuesPage.tsx` have concise `aria-label` matching the queue name
- [ ] `ProgressBar` inside queue cards has `aria-hidden="true"` when rendered inside a link
- [ ] `pnpm test` passes (once issue #016 is resolved) with accessibility assertions included
- [ ] Axe-core CLI or `@axe-core/react` scan reports zero violations on `QueuesPage`, `QueuePage`, and `DashboardPage`

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Include the output of an axe-core scan (or equivalent) before and after your changes.
- Show VoiceOver or NVDA walkthrough notes for the Tooltip, form error, and queue card link flows.
- Explain the trade-off between `hidden` attribute and CSS `visibility: hidden` for the tooltip pattern.
- Note that full WCAG 2.1 AA validation requires manual testing with assistive technologies and expert review, and that this issue addresses the most impactful automated-detectable violations.
