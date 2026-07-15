#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# create-issues.sh
# Bulk-creates the 15 advanced issues (007–021) using the GitHub CLI.
#
# Prerequisites:
#   1. Install the GitHub CLI: https://cli.github.com
#   2. Authenticate:  gh auth login
#   3. Make sure the labels below exist in your repo, or let the script
#      create them (see the label-creation block at the top).
#   4. Run from the repository root:
#        bash .github/ISSUES/create-issues.sh
# ---------------------------------------------------------------------------

set -euo pipefail

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "▶ Creating issues in: $REPO"

# ---------------------------------------------------------------------------
# 1. Ensure required labels exist (safe — skips if already present)
# ---------------------------------------------------------------------------
declare -A LABELS=(
  ["bug"]="d73a4a"
  ["enhancement"]="a2eeef"
  ["security"]="e4e669"
  ["performance"]="0075ca"
  ["refactor"]="fbca04"
  ["tests"]="0e8a16"
  ["accessibility"]="5319e7"
  ["api"]="1d76db"
  ["architecture"]="c5def5"
  ["documentation"]="0075ca"
  ["contracts"]="b60205"
  ["soroban"]="d4c5f9"
  ["sdk"]="bfd4f2"
  ["backend"]="f9d0c4"
  ["frontend"]="c2e0c6"
  ["ux"]="e99695"
)

echo "▶ Ensuring labels exist…"
for label in "${!LABELS[@]}"; do
  gh label create "$label" --color "${LABELS[$label]}" --force 2>/dev/null || true
done

# ---------------------------------------------------------------------------
# Helper: parse body from a markdown file (skip the first H1 title line,
# which becomes the --title argument)
# ---------------------------------------------------------------------------
issue_title() {
  grep -m1 '^# ' "$1" | sed 's/^# //'
}

issue_body() {
  # Everything after the first H1 line
  tail -n +2 "$1"
}

ISSUES_DIR="$(dirname "$0")"

# ---------------------------------------------------------------------------
# 2. Create each issue
# ---------------------------------------------------------------------------

create_issue() {
  local file="$1"; shift
  local labels="$*"
  local title
  title="$(issue_title "$file")"
  local body
  body="$(issue_body "$file")"
  local url
  url="$(gh issue create \
    --title "$title" \
    --body "$body" \
    --label "$labels" \
    --repo "$REPO")"
  echo "  ✓ Created: $url"
}

echo ""
echo "▶ Creating 15 advanced issues…"
echo ""

create_issue "$ISSUES_DIR/007-contracts-enrollment-count-never-increments.md" \
  "bug,contracts,soroban"

create_issue "$ISSUES_DIR/008-sdk-keypair-fromsecret-public-key-bug.md" \
  "bug,sdk,security"

create_issue "$ISSUES_DIR/009-backend-no-database-ephemeral-state.md" \
  "backend,architecture,enhancement,performance"

create_issue "$ISSUES_DIR/010-contracts-enrollment-proof-hash-not-cryptographic.md" \
  "security,contracts,soroban"

create_issue "$ISSUES_DIR/011-sdk-not-implemented-methods-soroban-rpc.md" \
  "sdk,enhancement,api"

create_issue "$ISSUES_DIR/012-backend-validate-stellar-address-middleware-orphaned.md" \
  "security,backend,bug,api"

create_issue "$ISSUES_DIR/013-frontend-enrollment-cancel-escrow-ui-missing.md" \
  "frontend,enhancement,ux,api"

create_issue "$ISSUES_DIR/014-contracts-vrf-advancement-rule-unimplemented.md" \
  "contracts,soroban,enhancement,architecture"

create_issue "$ISSUES_DIR/015-backend-queue-status-enum-mismatch.md" \
  "bug,backend,frontend,api"

create_issue "$ISSUES_DIR/016-frontend-no-test-suite.md" \
  "tests,frontend,enhancement"

create_issue "$ISSUES_DIR/017-contracts-factory-upgrade-queue-wasm-hash-mismatch.md" \
  "bug,contracts,soroban,security"

create_issue "$ISSUES_DIR/018-backend-contract-integration-soroban-rpc.md" \
  "backend,enhancement,api,architecture"

create_issue "$ISSUES_DIR/019-frontend-accessibility-keyboard-navigation.md" \
  "accessibility,frontend,enhancement"

create_issue "$ISSUES_DIR/020-contracts-identity-duplicate-behavior-unimplemented.md" \
  "contracts,soroban,enhancement,bug"

create_issue "$ISSUES_DIR/021-performance-frontend-queues-pagination.md" \
  "performance,frontend,backend,api"

create_issue "$ISSUES_DIR/022-refactor-sdk-lineproofclient-soroban-deployment.md" \
  "refactor,sdk,architecture,enhancement"

echo ""
echo "✅ All 16 issues created. (Issues 007–022)"
