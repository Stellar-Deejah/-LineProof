# LineProof Examples

Each directory under `examples/` is a **self-contained** TypeScript project
demonstrating LineProof for a specific use case. None of them import from
one another — each imports only from `@lineproof/sdk` (the workspace
package) and Node's standard library, so you can copy any single example
directory out of this repo and it will still work.

| Example | Use case | Notes |
|---|---|---|
| [`sneaker-drop`](./sneaker-drop) | Limited-inventory product drop | Simplest example — start here |
| [`concert-ticket`](./concert-ticket) | Event ticket allocation | Escrow deposit, FIFO advancement |
| [`event-ticketing`](./event-ticketing) | High-demand event tickets | Anti-scalping, transfer-attempt auditing |
| [`healthcare-scheduling`](./healthcare-scheduling) | Appointment scheduling | Escrow-backed no-show deterrent |
| [`university-admissions`](./university-admissions) | Admissions waitlist | Priority-tier advancement, not FIFO |
| [`visa-appointment`](./visa-appointment) | Government appointment queue | Off-chain identity commitments |

## Running an example against testnet

Every example expects a **real** factory and queue contract ID — none of
them ship with placeholder addresses. To run one:

1. **Deploy a factory and queue on testnet**, following the root
   [`README.md`](../README.md) / [`ARCHITECTURE.md`](../ARCHITECTURE.md)
   deployment instructions, or reuse contract IDs from an existing
   deployment your team controls.
2. **Fund an account** with [Friendbot](https://friendbot.stellar.org) if
   you need a fresh testnet keypair to sign transactions.
3. From the example's directory, copy the env template and fill it in:
```bash
   cd examples/sneaker-drop   # or any other example
   cp .env.example .env
   # edit .env: set FACTORY_CONTRACT_ID, QUEUE_CONTRACT_ID, and
   # LINEPROOF_PRIVATE_KEY (only needed for calls that submit a transaction)
```
4. **Install and run** from the repo root:
```bash
   pnpm install
   pnpm --filter @lineproof/example-sneaker-drop start
```
   Each example logs that it's ready once the SDK client and env vars are
   wired up, then has commented-out lines showing a queue lookup and
   enrollment check you can enable once you have live testnet data.

## Typechecking

```bash
pnpm --filter './examples/**' typecheck
```
This runs in CI on every PR (see `.github/workflows/test.yml`), so a
broken example fails the build instead of merging silently.

## Adding a new example

- Put it in its own directory with a `package.json`, `tsconfig.json`
  (extend `../tsconfig.base.json`), `src/index.ts`, and `.env.example`.
- Never import from another example directory — duplicate the small
  `requireEnv` / `createDevEnv` helper instead. It's a few lines and it's
  what keeps each example copy-pasteable on its own.
- Never hardcode a contract ID. Read it from `process.env` and throw a
  clear error if it's missing.
