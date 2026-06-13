# Contributing to LineProof 🚀

Thank you for your interest in improving LineProof. This document explains how to get started, development workflows, and review expectations.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold that standard.

## Getting started

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Rust >= 1.75 with `wasm32-unknown-unknown` target
- Docker and Docker Compose
- `soroban` CLI (`cargo install soroban-cli`)

### Clone and bootstrap

```bash
git clone https://github.com/lineproof/lineproof.git
cd lineproof
make install
make install-sdk
make install-toolchain
```

### Run tests

```bash
make test
```

### Lint and format

```bash
make lint
```

## Repository layout

```
contracts/  # Soroban contracts and workspace root
sdk/        # TypeScript SDK
examples/   # End-to-end example apps
docs/       # Developer content
scripts/    # Local network and deployment helpers
```

## Developer workflows

### Contracts

- Every crate lives under `contracts/`.
- Feature branches use the `feat/`, `fix/`, `chore/` prefix.
- Changes include a test that asserts the new behavior.
- Docs are updated alongside contract changes.

### SDK

- Prefer adding typed methods under `sdk/src/`.
- If a contract entry point changes, add a corresponding unit test in `sdk/tests/`.
- Changes must pass `make test` and `make lint`.

### Examples

- Examples must be runnable with `docker compose up -d`.
- They should document any local assumptions (network passphrase, RPC port, etc.).

## Pull requests

- Keep PRs focused. If you have unrelated changes, open separate PRs.
- Update `README.md` or docs if your change impacts public behavior.
- Confirm tests and builds are green.
- For code review, open a PR against `main`.

## Reporting issues

- Use the issue templates and include reproduction steps.
- Do not share secrets or credentials.

## Security disclosures

Please follow [SECURITY.md](SECURITY.md) for vulnerability reports.

## Style

- Rust: `cargo fmt` and `cargo clippy`
- TypeScript: follow existing patterns and keep types explicit

Thank you for contributing.
