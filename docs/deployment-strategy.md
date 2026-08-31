# Deployment Strategy

This document describes how LineProof should move from local development to public networks. It is a maintainer runbook, not a claim that production deployments are complete.

## Environments

| Environment | Purpose | Requirements |
|-------------|---------|--------------|
| Localnet | Fast contract development and SDK integration tests. | Docker Compose, Soroban CLI, local identities. |
| Testnet | Public integration testing and pilot queues. | Funded testnet accounts, published contract IDs, event monitoring. |
| Mainnet | Production queues for real resources. | Audited contracts, multisig admin, release checklist, monitoring. |

## Local Deployment

```bash
make docker-up
make deploy-localnet
make test
```

Local deployment should produce contract IDs, funded identities, and a repeatable way to reset state with `make docker-clean`.

## Testnet Deployment

Before testnet deployment:

- Run contract tests and SDK tests.
- Build release WASM artifacts.
- Record the git commit, contract checksums, and deployment identities.
- Publish factory and contract IDs in a release note or deployment manifest.
- Verify event indexing from at least one independent consumer.

## Mainnet Readiness Checklist

- Independent security review completed.
- `CHANGELOG.md` updated with release notes.
- `SECURITY.md` disclosure process confirmed.
- Admin authority controlled by multisig or equivalent governance.
- Contract upgrade path documented.
- Escrow flows tested with realistic assets and failure modes.
- Privacy review confirms no personal data is written on-chain.
- Incident response contacts and rollback limits are documented.

## Deployment Artifacts

Each deployment should record:

- Network passphrase.
- Contract IDs.
- WASM hashes.
- Deployer address.
- Admin or governance address.
- SDK version expected to support the deployment.
- Known limitations and migration notes.

## Rollback and Migration

Smart contract deployments are not rolled back like web services. If a contract version is defective, maintainers should:

1. Pause new queues when the contract supports pausing.
2. Publish an advisory with affected contract IDs.
3. Deploy a fixed implementation.
5. Preserve historical event logs for auditability.

## Container Security

Production container deployments must adhere to the following security baselines:
- **Non-root Execution:** Both backend and frontend containers must run as a non-root user (e.g., `lineproof` or `nginx`). The Dockerfile `USER` directive is mandatory.
- **Reproducible Builds:** Dependency installation in CI and Docker builds must use a frozen lockfile (`pnpm install --frozen-lockfile`) to prevent drift and transitive dependency attacks.
- **Health Checks:** Containers must implement a `HEALTHCHECK` directive that utilizes built-in runtime tools (e.g., Node.js `http.get` instead of `wget` or `curl`) to ensure orchestration layers accurately monitor liveness.
- **Minimal Surface:** The final runtime stages must omit build dependencies, test suites, and package managers where possible.
- **Base Image Pinning:** All `FROM` directives in Dockerfiles must pin base images to specific SHA digests (e.g., `node:20-alpine@sha256:...`) rather than mutable version tags. Dependabot is configured to automatically open PRs when updated digests are available.
- **CI Smoke Tests:** The `docker.yml` workflow includes a smoke test step that starts the built container, waits for it to become healthy, and curls the `/health` endpoint. If the container fails to respond, the workflow fails and the image is never pushed.
- **Vulnerability Scanning:** Every built image is scanned with [anchore/scan-action](https://github.com/anchore/scan-action) (Grype) before push. Scanning parameters:
  - **Severity threshold:** `critical` — findings at or above this level fail the build (`fail-build: true`).
  - **Scope:** The final runtime image (not intermediate build stages), scanned directly from the local Docker daemon.
  - **Trade-off:** Setting the threshold to `critical` blocks deployment for any unpatched critical CVE in the final image. This is the strictest policy and may require occasional triage of false positives or accept-risk overrides. A more permissive "advisory-only" approach would log findings without blocking the pipeline; the current configuration chooses security gate over velocity. Teams may relax to `high` after evaluating their vulnerability management process.
  - **Artifacts:** Scan reports in SARIF format are uploaded as workflow artifacts for every run (including PRs).
