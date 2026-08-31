# Event Ticketing Research

## Market Analysis

Event ticketing includes:
- Concerts and festivals
- Sports events
- Theater and performing arts
- Conferences and conventions
- Religious services (high-demand pilgrimages)

Secondary market problems:
- Automated bot purchasing
- Price inflation on resale platforms
- No ticket authenticity guarantee

## Key Pain Points

### Bot Infrastructure
- Scalper bots buy inventory instantly
- True fans cannot access tickets
- Infrastructure arms race between venues and bots

### Secondary Markets
- Tickets resold at 2x-10x face value
- No recourse for counterfeit tickets
- Fan experience diminished

### Venue Operations
- No-shows from speculative buyers
- Last-minute ticket releases
- Customer service for ticket issues

## LineProof Opportunities

### Verified Fan Programs
- Non-transferable ticket claims
- Identity binding prevents resale
- Deterministic allocation (FIFO or VRF lottery)

### Reduced No-Shows
- Escrow deposits refunded at venue entry
- Incentivize attendance over speculation
- Improved venue capacity planning

### Fan Experience
- Transparent queue progression
- Automated notifications
- Reduced anxiety about "fair" access

## Technical Considerations

### Entry Verification
- QR code tied to original identity
- Mobile app check-in
- Venue scanner integration

### Refund Mechanisms
- Automatic refund on attendance
- Manual refund on valid cancellation
- Time-based expiration for recovery

### Integration Points
- Ticketing platform APIs
- Payment processing
- Venue access control systems

---

## Concrete Technical Requirements

### 1. Verifiable Randomness (VRF) Allocation
- High-demand drops must execute advancement via Soroban contracts using commit-reveal randomness seeds rather than unblinded block timestamps, preventing validator front-running during ticket lotteries.
- Randomness proofs must be verifiable on-chain before advancing position status from `Pending` to `Advanced`.

### 2. Staked Escrow Attendance Refunds
- Ticket buyers deposit a required stake via `lineproof-escrow::deposit` during queue enrollment.
- Venue scanners submit a batch `release` or `refund` transaction within a 6-hour post-event settlement window upon dynamic QR verification at gate entry, eliminating no-shows.

### 3. Non-Transferable Identity Binding
- Smart contract logic (`lineproof-identity::can_transfer`) must evaluate to `false` for all non-identical recipient addresses.
- Direct peer-to-peer transfers are prohibited on-chain, rendering secondary scalper bot purchases worthless.

### 4. High-Concurrency Burst Protection & Asynchronous Queueing
- The backend ingest pipeline must process traffic bursts up to 5,000 req/sec via Redis sliding-window rate limiters.
- Submissions must be ingested into an asynchronous BullMQ queue before generating signed Soroban smart contract transactions to avoid RPC submission bottlenecks.

### 5. Offline Dynamic TOTP Gate Verification
- Mobile tickets must render a dynamic Time-based One-Time Password (TOTP) QR code generated from the user's private key and salted with `EnrollmentProof.proof_hash`.
- Handheld venue scanners must validate dynamic signatures offline without requiring live cellular data connections in congested venue environments.