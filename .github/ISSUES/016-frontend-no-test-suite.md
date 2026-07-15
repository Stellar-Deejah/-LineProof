# [Tests] Frontend has no test suite — no component tests, no hook tests, no integration tests

**Labels:** `tests`, `frontend`, `enhancement`
**Difficulty:** Advanced

---

## Problem

Three test gaps leave the entire frontend unverified:

1. **No test runner configured in `frontend/`**
   There is no `vitest.config.ts`, `jest.config.js`, or any test runner in `frontend/package.json`. The `devDependencies` contain no testing library. The `scripts` section has no `test` command. Running `pnpm test` in `frontend/` will fail with no test runner found. This means zero automated coverage for any React component, hook, or page in the frontend.

2. **Critical hooks have no test coverage**
   `frontend/src/hooks/useQueues.ts`, `useEnrollment.ts`, and `useEscrow.ts` contain all the API integration logic for the application. `useQueues` implements cancellable fetch with cleanup; `useEnrollment` manages optimistic state. Neither is tested. A regression in fetch error handling, the `cancelled` flag logic, or the `looksLikeStellar` validator in `QueuePage.tsx` would ship silently.

3. **Accessibility-critical components have no tests**
   `frontend/src/components/Tooltip.tsx` implements `role="tooltip"` with `onFocus`/`onBlur` handlers. `frontend/src/components/ProgressBar.tsx` uses `role="progressbar"` and `aria-valuenow`. `frontend/src/components/Spinner.tsx` uses an accessible SVG pattern. These ARIA patterns are tested only by visual inspection. A future refactor could silently break screen-reader compatibility.

**Impact:** The reference frontend is the primary integration example for operators building on LineProof. Without tests, any refactor, dependency upgrade, or feature addition risks introducing regressions that go undetected until a user encounters them.

---

## Proposed Solution

**Test runner setup:**
- Add `vitest`, `@vitest/ui`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, and `jsdom` to `frontend/devDependencies`.
- Create `frontend/vitest.config.ts` with `environment: 'jsdom'` and `globals: true`.
- Add `"test": "vitest run"` and `"test:watch": "vitest"` to `frontend/package.json scripts`.
- Add `frontend/src/test/setup.ts` that imports `@testing-library/jest-dom/vitest`.

**Hook tests:**
- `frontend/src/__tests__/hooks/useQueues.test.ts`: Mock `fetch` using `vi.stubGlobal`. Test loading state, success state with data, error state on non-OK response, and cleanup (no state update after unmount).
- `frontend/src/__tests__/hooks/useEnrollment.test.ts`: Test `enroll()` success, `enroll()` with conflict response (409), `cancel()` success, and network error.
- `frontend/src/__tests__/hooks/useEscrow.test.ts`: Test `deposit()` success, `deposit()` with duplicate (409), and `lookup()` not-found (404).

**Component tests:**
- `frontend/src/__tests__/components/Tooltip.test.tsx`: Verify `role="tooltip"` present, visible on `mouseenter`, hidden on `mouseleave`, visible on `focus`, hidden on `blur`.
- `frontend/src/__tests__/components/ProgressBar.test.tsx`: Verify `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` values are correct.
- `frontend/src/__tests__/components/QueueStatusBadge.test.tsx`: Verify each status variant renders the expected label and color class.

---

## Acceptance Criteria

- [ ] `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` in `frontend/devDependencies`
- [ ] `frontend/vitest.config.ts` configured with `jsdom` environment
- [ ] `pnpm test` in `frontend/` runs and exits with code 0
- [ ] `useQueues` tested for loading, success, error, and cleanup states
- [ ] `useEnrollment` tested for enroll success, conflict, cancel, and network error
- [ ] `useEscrow` tested for deposit success, duplicate, and lookup not-found
- [ ] `Tooltip` tests verify `role="tooltip"` and keyboard/mouse show/hide behaviour
- [ ] `ProgressBar` tests verify ARIA attributes match the `value` prop
- [ ] `QueueStatusBadge` tests cover all status variants
- [ ] All tests use `vi.stubGlobal('fetch', ...)` — no real network calls
- [ ] Test coverage report shows ≥ 70% line coverage for the tested files

---

## Contributor Note

If you're assigned to this issue, your PR description must:
- Show the `pnpm test --coverage` summary output.
- Explain the fetch mocking strategy (global stub vs. `msw` vs. custom handler) and justify the choice.
- Describe any challenges with testing React hooks that use `useEffect` with cleanup (the `cancelled` pattern in `useQueues`).
- Include the `vitest.config.ts` and `setup.ts` files in full in the PR description for reviewer clarity.
- Note any components that were deliberately excluded from this initial sweep and why.
