# Security Policy

## Supply Chain Hardening

This project implements the following measures to secure the software supply chain:

### GitHub Actions
- All third-party actions are pinned to immutable SHA digests, not mutable version tags.
- The `dtolnay/rust-toolchain` action is pinned to the `v1` tag SHA instead of the floating `stable` branch.
- Dependabot is configured to automatically open PRs that update pinned action SHAs.
- Workflow permissions are scoped to the minimum required for each job.

### Dependency Installation
- CI workflows use `pnpm install --frozen-lockfile` to prevent silent dependency drift.
- The lockfile (`pnpm-lock.yaml`) is committed and must be reviewed as part of code review.
- The `test.yml` and `lint.yml` pipelines run with a frozen lockfile to ensure reproducibility.

### Vulnerability Scanning
- `pnpm audit --audit-level moderate` runs in the Security Scan workflow on every push and PR.
- `cargo audit` runs weekly in the Security Scan workflow.
- GitHub CodeQL analysis runs on every push and PR, plus a weekly schedule.
- Dependabot security updates are enabled for npm, Cargo, and GitHub Actions dependencies.

### Release Pipeline
- The `release.yml` workflow has `contents: read` at the top level, with `contents: write` scoped only to the `create-release` job.
- `NPM_TOKEN` is scoped to the `build-sdk` job and is never exposed to other jobs.
- WASM build artifacts are uploaded as workflow artifacts before being attached to the GitHub Release.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| 0.0.x   | No        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please use the private vulnerability reporting mechanism on GitHub:
- https://github.com/lineproof/lineproof/security/advisories/new

Or email **security@lineproof.dev** with:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix if available

We aim to acknowledge reports within 72 hours and provide a resolution
timeline within 7 days.
