# Frontend accessibility validation

## Automated axe-core scan

Command:

```text
npm test -- --run
```

### Before

The first page-level scan added for this work reported:

```text
QueuesPage
  heading-order: 1 violation

QueuePage
  aria-progressbar-name: 1 violation
  definition-list: 1 violation

DashboardPage
  heading-order: 1 violation
```

The original tooltip behavior was also covered by a targeted semantic assertion.
The assertion failed because the tooltip was unmounted while hidden and the
trigger wrapper had no `aria-describedby` reference. Axe does not report that
missing association by itself, so the regression test checks the ID reference
directly in addition to running axe.

### After

```text
Test Files  8 passed (8)
Tests       32 passed (32)

QueuesPage:    0 violations
QueuePage:     0 violations
DashboardPage: 0 violations
Tooltip:       0 violations
```

The scans run with `jest-axe` 10.0.0 and axe-core in Vitest's jsdom
environment.

## VoiceOver and NVDA walkthrough notes

These flows should be manually verified on macOS VoiceOver and Windows NVDA:

1. Tab to a control wrapped by `Tooltip`.
   - Expected: the control is described by the tooltip text through the stable
     `aria-describedby` relationship.
   - Expected: focusing and hovering reveal the same tooltip; blurring and
     leaving hide it without removing the referenced node.
2. Submit the enrollment form with an invalid Stellar public key.
   - Expected: the validation message is announced immediately as an assertive
     alert without moving focus.
3. Complete a successful enrollment.
   - Expected: “Enrolled successfully…” is announced as a polite status.
4. Trigger a dashboard lookup network failure.
   - Expected: the lookup error is announced immediately as an assertive alert.
5. Navigate the queue-card links.
   - Expected: each link is announced only by the queue name; progress details
     are not included in the link's accessible name.

VoiceOver and NVDA were not available in the implementation environment, so
the checklist above records the required manual verification rather than
claiming an assistive-technology run. Automated checks cannot establish full
WCAG 2.1 AA conformance. Full validation requires manual keyboard, zoom,
contrast, VoiceOver, and NVDA testing with representative browsers.
