# Example: Visa Appointment Queue

This example demonstrates LineProof for government visa appointment scheduling — one of the most abuse-prone queue systems globally.

## Problem

Visa appointment slots are routinely:
- Claimed by bots within seconds of release
- Resold through unofficial brokers at significant markups
- Inaccessible to genuine applicants without connections

## Solution

LineProof enforces:
- One position per verified identity (passport number hash as commitment)
- Non-transferable positions by protocol
- Auditable FIFO ordering with on-chain proof

## Implementation Notes

**Identity commitment:** Raw personal data (passport numbers, names) must never be written on-chain. Instead, hash the personal identifier off-chain and use the hash as the queue identity:

```typescript
import { createHash } from 'crypto';

function identityCommitment(passportNumber: string, salt: string): string {
  return createHash('sha256')
    .update(`${passportNumber}:${salt}`)
    .digest('hex');
}

// Derive a Stellar keypair from the commitment (simplified — use a proper KDF in production)
const commitment = identityCommitment('AB1234567', process.env.IDENTITY_SALT!);
```

**Queue config:**

```typescript
const queueAddress = await factory.createQueue({
  slug: 'visa-tourist-batch-q3-2025',
  name: 'Tourist Visa Batch Q3 2025',
  maxPositions: 800,
  enrollmentOpenAt: openTimestamp,
  enrollmentCloseAt: closeTimestamp,
  advancementRule: AdvancementRule.FIRST_IN_FIRST_OUT,
  escrowRequired: false,
});
```

## Privacy Considerations

- Never log or store raw passport numbers with contract data
- The identity commitment is a one-way hash — it proves uniqueness without revealing identity
- Stronger privacy can be achieved with zero-knowledge proofs (planned roadmap item)

## Audit Trail

Officials and civil-society observers can verify:
- Total enrollment count at any point in time
- Exact enrollment timestamps (ledger-anchored)
- That no position was skipped or duplicated

## Key Properties

| Property | Value |
|----------|-------|
| Identity model | Off-chain hash commitment |
| Advancement rule | FIFO |
| Escrow | Not required |
| Privacy | PII stays off-chain |
| Auditable | Yes |
