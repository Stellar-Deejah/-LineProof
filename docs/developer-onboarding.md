# Developer Onboarding

This guide gets new contributors from a fresh clone to a useful first pull request.

## Prerequisites

- Node.js 18 or newer.
- pnpm 8 or newer.
- Rust 1.75 or newer.
- `wasm32-unknown-unknown` Rust target.
- Docker and Docker Compose.
- Soroban CLI.

## Setup

```bash
git clone https://github.com/lineproof/lineproof.git
cd lineproof
make install
make install-toolchain
pnpm prepare
```

## First Build

```bash
make build
make test
make lint
```

If a dependency is missing, install that tool rather than editing generated lockfiles or build output.

## Code Formatting & IDE Setup

This repository uses **Prettier**, **ESLint**, and **cargo fmt** enforced via **Husky** and **lint-staged** git hooks.

- **Pre-commit Hooks:** Staged TypeScript files are auto-formatted with Prettier and Rust files are formatted with `cargo fmt` before each commit.
- **VS Code:** Install recommended extensions (`.vscode/extensions.json`) for `rust-analyzer`, `ESLint`, `Prettier`, and `Tailwind CSS IntelliSense`. Format-on-save is enabled in `.vscode/settings.json`.
- **EditorConfig:** Standardized indent settings (2 spaces for TS/JS/JSON, 4 spaces for Rust) are defined in `.editorconfig`.

## Local Network

```bash
make docker-up
make deploy-localnet
make docker-down
```

> **Note on Backend Storage:** The local stack backend currently runs using an in-memory storage layer (ephemeral state wiped on restart). The PostgreSQL container service will be restored when full database persistence (issue #9) is implemented.

Use `make docker-clean` when you need to reset local ledger state.

## Repository Map

- `contracts/`: Soroban contracts and Rust tests.
- `sdk/`: TypeScript SDK and SDK tests.
- `frontend/`: Reference React/Vite app.
- `backend/`: Reference Express API.
- `docs/`: Maintainer and integrator documentation.
- `research/`: Domain research for product decisions.
- `examples/`: Example integrations for real-world queue domains.
- `scripts/`: Local deployment and automation helpers.

## Good First Contributions

- Add tests for documented lifecycle or escrow invariants.
- Improve SDK examples when public APIs change.
- Add missing event documentation.
- Tighten research notes with clear protocol implications.
- Fix documentation that overstates current implementation status.

## Pull Request Checklist

- Keep the change focused.
- Update docs for public behavior changes.
- Add or update tests for code changes.
- Run `make test` and `make lint` when practical.
- Include security notes when changing authorization, escrow, identity, or queue ordering.

## Browser Support & Build Configuration

### Browser Support Policy

The frontend is compiled targeting modern browsers to ensure optimal performance, smaller bundle sizes, and native support for modern JavaScript features. Our explicit build targets are:

- **ES2020** baseline
- **Chrome 87+**
- **Firefox 78+**
- **Safari 14+**

_Trade-offs:_ By explicitly setting these targets, we exclude legacy browsers (e.g., IE11, older Safari/Chrome versions). This avoids injecting unnecessary polyfills and allows the codebase to safely use modern syntax (optional chaining, nullish coalescing, top-level await) without transpilation overhead.

### Build Output & Optimization

- **Vendor Chunking:** The `@stellar/stellar-sdk` (~1.2MB) is isolated into a dedicated `stellar-vendor` chunk. This prevents it from bloating the main application bundle and ensures it is cached independently by the browser. Other third-party dependencies are grouped into a general `vendor` chunk.
- **Environment Variables:** All `VITE_*` environment variables are strictly typed in `src/vite-env.d.ts`. TypeScript will enforce that required env vars are present and correctly typed at build time.
- **Chunk Size Limit:** The Rollup warning limit is set to `600KB`. If a chunk exceeds this during `pnpm build`, it will trigger a warning, prompting the developer to investigate further code-splitting (e.g., using `React.lazy()`).

## Where to Start Reading

1. [../README.md](../README.md)
2. [../ARCHITECTURE.md](../ARCHITECTURE.md)
3. [queue-lifecycle.md](queue-lifecycle.md)
4. [escrow-model.md](escrow-model.md)
5. [threat-model.md](threat-model.md)
