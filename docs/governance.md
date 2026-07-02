# Governance

LineProof is an open-source protocol governed by its maintainers and community.

## Decision Making

Decisions fall into three tiers:

| Tier | Examples | Process |
|------|---------|---------|
| **Routine** | Bug fixes, docs, tests, minor refactors | PR review by one maintainer |
| **Significant** | New contract functions, SDK API changes, CI workflow changes | PR review by two maintainers + 48h comment window |
| **Protocol-level** | Breaking contract interface changes, governance model changes, production admin key rotation | RFC in GitHub Discussions + 7-day comment window + majority maintainer approval |

## Maintainer Responsibilities

- Review pull requests within 5 business days
- Triage new issues within 3 business days
- Publish a new release at least once per milestone
- Keep `CHANGELOG.md` up to date before each release
- Respond to security reports within 72 hours (see `SECURITY.md`)

## Becoming a Maintainer

Active contributors who have merged at least 5 significant PRs may be nominated as maintainers by an existing maintainer. Nominations are approved by a majority of current maintainers.

## RFC Process

For protocol-level changes:

1. Open a GitHub Discussion with the `RFC` label.
2. Include: motivation, proposed change, alternatives considered, and migration path.
3. Allow 7 days for community feedback.
4. Maintainers vote — simple majority required.
5. If approved, a tracking issue is opened and the RFC is linked to it.

## Code of Conduct

All contributors must follow the [Code of Conduct](../CODE_OF_CONDUCT.md).

## Contact

- GitHub Discussions: https://github.com/lineproof/lineproof/discussions
- Security: security@lineproof.dev
