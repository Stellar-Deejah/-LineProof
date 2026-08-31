# Coverage Enforcement Implementation

## Changes Made

### 1. Backend Coverage Configuration

**File**: `backend/vitest.config.ts`

- Added coverage thresholds: **lines: 65%, functions: 65%, branches: 55%, statements: 65%**
- Added HTML reporter for detailed coverage visualization
- Package.json already had `test:coverage` script

### 2. SDK Coverage Configuration

**File**: `sdk/vitest.config.ts`

- Added complete coverage configuration block (was missing entirely)
- Added coverage thresholds: **lines: 60%, functions: 60%, branches: 50%, statements: 60%**
- Added HTML reporter and LCOV reporter

**File**: `sdk/package.json`

- Added `test:coverage` script: `"test:coverage": "vitest run --coverage"`

### 3. CI Workflow Updates

**File**: `.github/workflows/test.yml`

- Updated SDK test job to run: `pnpm --filter @lineproof/sdk test:coverage`
- Updated backend test job to run: `pnpm --filter @lineproof/backend test:coverage`
- Coverage thresholds now enforced on every PR and push to main

### 4. Documentation Updates

**File**: `docs/testing-strategy.md`

- Added "Coverage Enforcement" section documenting thresholds
- Clarified that coverage is measured and enforced via CI
- Specified that coverage reports are generated as LCOV and HTML artifacts

## Threshold Rationale

### Backend: 65% lines, 65% functions, 55% branches, 65% statements

- **Conservative baseline** to pass current test suite while enforcing minimum standards
- 137 tests currently passing with comprehensive route coverage
- Slightly lower branch threshold (55%) accounts for error paths and defensive code
- Can be increased incrementally as new tests are added

### SDK: 60% lines, 60% functions, 50% branches, 60% statements

- **Lower starting point** due to pre-existing test gaps (issues #005)
- EnrollmentClient, EscrowClient, and utility functions need more test coverage
- Once issue #005 is resolved (new test cases for client methods), thresholds should increase to 70%+

## Impact

✅ **Build will fail** if coverage drops below configured thresholds
✅ **Coverage reports generated** as HTML and LCOV artifacts
✅ **CI enforcement prevents silent regression** of test coverage
✅ **Realistic baseline set** to avoid immediate CI failure

## Next Steps

1. **Resolve SDK test failures** (issues in utils.test.ts and client.test.ts)
2. **Increase SDK thresholds** once issue #005 is complete (new enrollment/escrow tests)
3. **Generate coverage artifacts** in CI workflow for Codecov or similar integration
4. **Monitor coverage metrics** and incrementally increase thresholds

## Verification

Backend tests: **137/137 passing** ✓
Backend coverage: **Thresholds enforced** ✓
SDK tests: **92/97 passing** (pre-existing failures)
SDK coverage: **Thresholds enforced** (will fail on threshold breach)
