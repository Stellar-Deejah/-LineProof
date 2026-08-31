# Contributing to LineProof

Thank you for helping improve LineProof. This document explains the expected development workflow and review standards.

## Code of Conduct

This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Getting Started

Prerequisites:

- Node.js 18 or newer.
- pnpm 8 or newer.
- Rust 1.75 or newer with the `wasm32-unknown-unknown` target.
- Docker and Docker Compose.
- Soroban CLI.

Bootstrap:

```bash
git clone https://github.com/lineproof/lineproof.git
cd lineproof
make install
make install-toolchain
make build
```

Run checks:

```bash
make test
make lint
```

## Rust Formatting

CI enforces `cargo fmt` on all Rust code. Before pushing, format locally:

```bash
cd contracts
cargo fmt --all
```

Verify formatting without modifying files:

```bash
cd contracts
cargo fmt --all -- --check
```

The lint CI job will fail if code is not formatted.

For a fuller walkthrough, see [docs/developer-onboarding.md](docs/developer-onboarding.md).

## Repository Layout

- `contracts/`: Soroban contracts and Rust tests.
- `sdk/`: TypeScript SDK.
- `frontend/`: Reference React/Vite application.
- `backend/`: Reference Express API.
- `examples/`: Domain-specific sample apps.
- `docs/`: Architecture, security, testing, deployment, and integration docs.
- `research/`: Domain research and product notes.
- `scripts/`: Local deployment helpers.

## Pull Requests

- Keep changes focused and reviewable.
- Add or update tests for code changes.
- Update docs for public behavior changes.
- Update `CHANGELOG.md` for user-visible changes.
- Explain any checks you could not run.
- Do not include generated build output unless the repo explicitly tracks it.

## Commit Style

Use conventional prefixes when practical:

- `docs:`
- `feat:`
- `fix:`
- `test:`
- `refactor:`
- `chore:`

## Security-Sensitive Changes

Call out security implications when changing:

- Queue ordering or lifecycle transitions.
- Identity binding or duplicate prevention.
- Escrow deposit, release, refund, or expiry behavior.
- Contract authorization or upgrade authority.
- SDK signing or transaction construction.
- Any field that could contain personal data.

Security vulnerabilities should be reported through [SECURITY.md](SECURITY.md), not public issues.
