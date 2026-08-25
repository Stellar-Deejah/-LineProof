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

## Content Security Policy (CSP) Configuration

The frontend production image (`frontend/nginx.conf`) ships a strict Content-Security-Policy:

```
default-src 'self';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' ${API_ORIGIN} https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
report-uri /csp-report;
report-to csp-endpoint;
```

### Why no `'unsafe-inline'` in `style-src`

The codebase renders all styles through Tailwind CSS class utilities plus a small
set of stylesheet classes (`global.css`). There are no inline `style="..."` attributes
or `<style>` tags in the production bundle:

- `ProgressBar` sets its fill width via the CSSOM (`element.style.width`) instead of
  an inline style attribute.
- `QueuesPage` card layout hints (`content-visibility`, `contain-intrinsic-size`) live
  in the `.queue-card` stylesheet class.
- The built `dist/index.html` contains no inline scripts, so `script-src 'self'`
  needs no `sha256-*` hash allowlist.

Before adding an inline style to the codebase, prefer a stylesheet class or CSSOM
assignment; otherwise a `sha256-*` hash must be added to the CSP.

### Configuring the API origin

`connect-src` allows the backend API origin through the nginx `$api_origin`
variable, which defaults to `http://localhost:4000`. For deployments where the API
is served from a different origin (e.g. `https://api.lineproof.com`), override it at
container startup:

```bash
# Edit the `set $api_origin "..."` line in the copied nginx.conf, or mount a
# replacement config:
docker run -v ./custom-nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  -p 8080:80 lineproof-frontend
```

`connect-src` additionally allows the Stellar Horizon and Soroban RPC endpoints the
frontend speaks to at runtime; extend the list if additional integrations are added.

### Violation reporting

Violations are reported to the same-origin `/csp-report` endpoint via
`report-uri`/`Reporting-Endpoints`. Point `report-uri` at your CSP collector if the
backend does not serve that path, and confirm `report-to`/`Reporting-Endpoints` are
consistent before enforcing a strict policy in production.

### Rollout guidance

1. Deploy with the CSP in `Report-Only` mode first
   (`Content-Security-Policy-Report-Only`) and collect violations for a soak period.
2. Fix or allowlist any legitimate violations.
3. Switch to enforcement (`Content-Security-Policy`) once the report stream is clean.
4. Keep the violation collector wired up after enforcement; a clean report stream
   confirms the policy is not breaking the app.
