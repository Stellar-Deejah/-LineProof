# LineProof

> **Provably Fair Waiting Lists for High-Demand Services**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stellar](https://img.shields.io/badge/Built%20for-Stellar-green)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Built%20with-Soroban-green)](https://soroban.stellar.org)

LineProof is an open-source protocol built on **Stellar** and **Soroban** that enables organizations to create transparent, auditable, and **non-transferable** waiting lists for oversubscribed resources. Queue positions cannot be transferred, sold, or manipulated—making fairness verifiable infrastructure.

---

## Problem Statement

Modern waiting lists for high-demand services suffer from systemic failures:

| Problem | Impact |
|---------|--------|
| **Scalping & Queue Jumping** | Bots and resellers capture positions, sell them at premium prices |
| **Opacity** | Applicants cannot verify their position is legitimate |
| **Favoritism** | Manual overrides create unequal access |
| **Duplicate Exploits** | Users game multi-entry rules |
| **Trust Gaps** | Organizations must centrally monitor, increasing cost and risk |
| **Bypassing Eligibility** | Ineligible participants circumvent rules |

**Concert tickets, sneaker drops, visa appointments, housing lotteries, scholarship allocations, healthcare scheduling, university admissions**—all suffer from the same root cause: waiting lists that are *administered*, not *verified*.

---

## Why Existing Solutions Fail

### Database-Backed Queues
- Admin-controlled; no independent verification
- Subject to insider manipulation
- No cryptographic proof of position
- No escrow enforcement

### NFT-Based Queues
- Positions remain transferable (scalping enabled)
- Gas costs on congested networks
- Metadata can be altered by issuer
- No deterministic advancement

### First-Come-First-Serve
- Favors bots over humans
- Timezone and latency exploitation
- No eligibility enforcement
- No fair randomization

**None of these provide cryptographic guarantees of fairness.**

---

## Proposed Solution

LineProof replaces trust with **cryptographic verifiability**:

```
Organization  →  Deploys Soroban Queue Contract
                        ↓
Applicant     →  Enrolls with identity binding
                        ↓
Contract      →  Assigns non-transferable position (token)
                        ↓
Timeline      →  Advances deterministically or by admin action (logged on-chain)
                        ↓
Service       →  Accepts on-chain proof of position
```

**Key Design Principles:**
- Positions are **non-transferable** by protocol (no trade, no resale)
- Enrollment is **identity-bound** to prevent duplicates
- Advancement is **deterministic or transparently logged**
- All state transitions emit **verifiable events**
- Escrow holdings are **hardened against misappropriation**

---

## Core Features

### Non-Transferable Queue Positions
Positions are strictly bound to the enrolling identity. Any transfer attempt reverts at the contract level. Scalping is architecturally impossible.

### Identity Binding & Duplicate Prevention
Smart contracts enforce one-position-per-identity per queue. Duplicate detection is on-chain and auditable.

### Deterministic Advancements
Queue advancement follows fixed rules (timers, capacity, priority tiers) encoded in Soroban contracts. No off-chain discretion beyond pre-declared parameters.

### Optional Escrow Module
Organizations can require payments collected at enrollment to be held in escrow and released or refunded by deterministic protocol rules—not manual review.

### Verifiable Event Log
Every significant action emits a Soroban event. Auditors, applicants, and the public can verify queue integrity without trusting the operator.

### Version Management
QueueFactory supports semantic versioning of queue contracts. Organizations can upgrade without breaking historical audit trails.

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                    LineProof Protocol                      │
├──────────────┬──────────────────┬──────────────────────────┤
│   Queue      │   Enrollment     │   Escrow                 │
│   Factory    │   Module         │   Contract               │
├──────────────┼──────────────────┼──────────────────────────┤
│  - Deploy    │  - Enroll        │  - Hold                  │
│  - Register  │  - Validate      │  - Release               │
│  - Version   │  - Detect dupes  │  - Refund                │
│  - Metadata  │  - Bind identity │  - Reserve               │
├──────────────┴──────────────────┴──────────────────────────┤
│                   Soroban Runtime                         │
├───────────────────────────────────────────────────────────┤
│                    Stellar Network                        │
└───────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────┐
   │              TypeScript SDK (@lineproof/sdk)         │
   │  - QueueClient   - EscrowClient   - IdentityClient   │
   └──────────────────────────────────────────────────────┘
```

**Protocol Layers:**
1. **Settlement Layer** — Stellar for payment channels, XLM escrow backing
2. **Contract Layer** — Soroban smart contracts enforcing queue logic
3. **SDK Layer** — TypeScript/JS client for application integration
4. **Application Layer** — Consumer-facing drop platforms, government portals

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- pnpm ≥ 8
- Rust ≥ 1.75 with wasm32-unknown-unknown target
- Docker (optional for local soroban network)

### Installation

```bash
git clone https://github.com/lineproof/lineproof.git
cd lineproof

# Install SDK
pnpm install

# Build Soroban contracts
pnpm run build:contracts

# Build TypeScript SDK
pnpm run build:typescript
```

### Deploy a Local Testnet

```bash
# Start local Soroban network (Docker)
docker compose -f docker/docker-compose.yml up -d

# Initialize network and fund accounts
soroban network add --local friendbot-url http://localhost:8000/friendbot
soroban config identity generate deployer
soroban config identity address deployer

# Deploy factory
soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/lineproof_queue_factory.wasm \
  --source deployer \
  --network local
```

### Create Your First Queue

```typescript
import { LineProofClient, QueueFactory } from "@lineproof/sdk";

const client = new LineProofClient({ networkPassphrase: NetworkPassphrase.TESTNET });

const factory = client.deployFactory();
await factory.createQueue({
  name: "Sneaker Drop #001",
  slug: "sneaker-drop-001",
  maxPositions: 500,
  enrollmentOpenAt: new Date("2026-07-01T00:00:00Z"),
  enrollmentCloseAt: new Date("2026-07-02T00:00:00Z"),
  advancementRule: AdvancementRule.FIRST_IN_FIRST_OUT,
  escrowRequired: true,
  escrowAsset: nativeAssetSymbol,
  escrowAmountReadable: 150,
});
```

---

## Repository Structure

```
lineproof/
├── README.md                    # You are here
├── CONTRIBUTING.md              # Contribution guidelines
├── CODE_OF_CONDUCT.md           # Community standards
├── SECURITY.md                  # Security policy & disclosure
├── LICENSE                      # MIT License
├── ROADMAP.md                   # Project roadmap
├── package.json                 # Monorepo package manifest
├── Makefile                     # Developer CLI shortcuts
│
├── contracts/                   # Soroban smart contracts (Rust workspace)
│   ├── Cargo.toml
│   ├── lineproof-queue-factory/ # Factory for queue deployment
│   ├── lineproof-queue/         # Core queue contract
│   ├── lineproof-enrollment/    # Enrollment logic
│   ├── lineproof-escrow/        # Payment escrow
│   └── lineproof-identity/      # Identity binding & non-transferability
│
├── sdk/                         # TypeScript SDK (pnpm workspace)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── client.ts            # LineProofClient
│   │   ├── queue.ts             # QueueClient
│   │   ├── enrollment.ts        # EnrollmentClient
│   │   ├── escrow.ts            # EscrowClient
│   │   ├── identity.ts          # IdentityClient
│   │   └── types.ts             # TypeScript type definitions
│   └── tests/
│
├── examples/                    # Sample applications
│   ├── sneaker-drop/
│   ├── concert-ticket/
│   ├── visa-appointment/
│   └── healthcare-scheduling/
│
├── docs/                        # Developer documentation
│   ├── concepts.md              # Protocol concepts & glossary
│   ├── queue-lifecycle.md       # Queue state machine
│   ├── escrow-lifecycle.md      # Escrow state machine
│   ├── events.md                # Event model reference
│   ├── fair-invariants.md       # Formal fairness properties
│   ├── integration-guide.md     # Step-by-step integration
│   └── api-reference/           # OpenAPI / SDK reference
│
├── scripts/                     # Build/deployment automation
│   ├── deploy.sh
│   ├── test-setup.sh
│   └── local-validator.sh
│
└── .github/
    └── workflows/
        ├── lint.yml
        ├── test.yml
        └── security-scan.yml
```

---

## Example Use Cases

### 🥿 Sneaker Drop
Release limited-edition sneakers. Queue positions are bound to Stellar public keys; advancement is deterministic. Purchasers prove on-chain position at checkout.

### 🎫 Concert Tickets
Prevent scalping by making ticket claims non-transferable. Escrow holds payment; funds release only when tickets are confirmed. Duplicate wallet signing is blocked by on-chain identity checks.

### 📋 Visa Appointments
Transparent appointment slots with eligibility verification. Audit log provides government transparency. No backdoor overrides.

### 🏥 Healthcare Scheduling
Fair allocation of slots across insurance tiers, urgency levels, and seniority rules—all encoded on-chain.

### 🎓 Scholarship Allocation
Transparent criteria implementation. Population-level anonymized audit data enables public accountability without revealing individual applicants.

### 🏘️ Public Housing
Anti-manipulation lottery with verifiable randomness source. All excludes and inclusions are explainable and auditable.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full timeline. Key milestones:

- **v0.1** — Core contracts, local testnet, basic TypeScript SDK
- **v0.2** — Full escrow module, property-based testing, audit readiness
- **v0.3** — Advanced fairness mechanisms (verifiable randomness, priority tiers)
- **v0.4** — Public testnet deployment, governance framework
- **v1.0** — Production-grade security audit, ecosystem SDKs, governance fully decentralized

---

## Contributing

We welcome contributions from Stellar developers, protocol researchers, civil engineers, and fairness advocates. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Code style and structure
- Commit conventions
- Review process
- Security disclosures

All participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Security

LineProof handles real-world resources and sensitive user data. Security is our highest priority.

- **Responsible disclosure:** See [SECURITY.md](SECURITY.md) for reporting procedures
- **Audits:** We engage professional audit firms pre-launch
- **Formal verification:** Target modules are verified formally for safety properties
- **Threat modeling:** Continuous protocol-level risk assessment

---

## License

[MIT](LICENSE) © LineProof Contributors

---

## Community

- **GitHub:** [lineproof/lineproof](https://github.com/lineproof/lineproof)
- **Discord:** Coming soon
- **Twitter:** Coming soon

Built for the Stellar ecosystem. With support from the Stellar Development Foundation.
