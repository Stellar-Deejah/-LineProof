# Integration Guide

This guide walks through integrating LineProof into your application.

## Prerequisites

1. **Stellar Account**: Create or use an existing Stellar keypair
2. **Testnet Setup**: Fund account via Friendbot or use existing mainnet account
3. **SDK Installation**: `pnpm add @lineproof/sdk` or install from source

## Step 1: Initialize Client

```typescript
import { LineProofClient, NetworkPassphrase } from '@lineproof/sdk';

const client = new LineProofClient({
  networkPassphrase: NetworkPassphrase.TESTNET,
  rpcServerUrl: 'https://soroban-testnet.stellar.org',
  privateKey: process.env.STELLAR_PRIVATE_KEY,
});
```

## Step 2: Deploy Queue Factory (or use existing)

```typescript
const factoryId = await client.deployFactory();
console.log('Factory deployed at:', factoryId);
```

## Step 3: Create a Queue

```typescript
import { QueueDeploymentParams, AdvancementRule } from '@lineproof/sdk';

const params: QueueDeploymentParams = {
  slug: 'product-launch-001',
  name: 'Product Launch #001',
  maxPositions: 1000,
  enrollmentOpenAt: Math.floor(Date.now() / 1000),
  enrollmentCloseAt: Math.floor(Date.now() / 1000) + 86400 * 7, // 1 week
  advancementRule: AdvancementRule.FIRST_IN_FIRST_OUT,
  escrowRequired: false,
};

const queueAddress = await factory.createQueue(params);
```

## Step 4: Participant Enrollment

```typescript
// Create a client for the participant
const participantClient = new LineProofClient({
  networkPassphrase: NetworkPassphrase.TESTNET,
  rpcServerUrl: 'https://soroban-testnet.stellar.org',
  privateKey: participantPrivateKey,
});

const proof = await participantClient.enroll(queueAddress);
console.log('Enrolled at position:', proof.positionId);
```

## Step 5: Check Queue Position

```typescript
const position = await client.getPosition(proof.positionId);
console.log('Status:', position.status);
console.log('Advanced at:', position.advancedAt);
```

## Step 6: Advance Queue (Admin)

```typescript
// Advance up to 100 positions
const advancedIds = await factory.advance(queueAddress, 100);
console.log('Advanced positions:', advancedIds);
```

## Escrow Integration

If escrow is required:

```typescript
// Deposit into escrow
const depositTx = await client.escrow.deposit(queueAddress, amount);

// Release upon advancement (handled automatically)
// or refund on queue cancellation
await client.escrow.refund(queueAddress, identityAddress);
```

## Event Listening

```typescript
const events = await client.getEvents('lineproof.queue', queueAddress);
for (const event of events) {
  console.log(event.kind, event.positionId, event.timestamp);
}
```

## Next Steps

- See [docs/use-cases.md](./use-cases.md) for industry-specific patterns
- Review [docs/security-considerations.md](./security-considerations.md)
- Check [examples/](../examples/) for full application examples

## Webhooks

LineProof supports real-time notifications via webhooks. When state-mutating events occur, the backend computes an HMAC-SHA256 signature of the payload and dispatches a signed POST request to your registered webhook URL.

### Webhook Registration

Manage registrations via the gated `/api/webhooks` REST endpoints. Requests require the operator token in the `Authorization: Bearer <token>` header.

#### Create Subscription

`POST /api/webhooks`
```json
{
  "url": "https://yourserver.com/webhooks/lineproof",
  "secret": "your_webhook_signing_secret",
  "events": ["enrollment.created", "escrow.released"]
}
```
*Note: Use `["*"]` to subscribe to all event types.*

#### List Subscriptions

`GET /api/webhooks`

#### Delete Subscription

`DELETE /api/webhooks/:id`

### Payload Format

```json
{
  "id": "e0e84bfa-fce6-4a4f-8e47-aef233ef52f1",
  "event": "enrollment.created",
  "created": "2026-07-22T21:16:30.123Z",
  "data": {
    "queueId": "launch-001",
    "identity": "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    "enrolledAt": "2026-07-22T21:16:29.980Z",
    "conflict": false,
    "cancelled": false
  }
}
```

### Signature Verification

To prevent spoofing attacks, verify the HMAC-SHA256 signature passed in the `X-LineProof-Signature` header:

```typescript
import crypto from 'crypto';

export function verifyWebhook(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signatureHeader.substring(7); // strip 'sha256='
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timingSafeEqual to protect against timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(computedSignature, 'hex')
  );
}
```