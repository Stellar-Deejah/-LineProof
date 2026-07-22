import { describe, it, expect } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import { deserializeContractEvent, type RawContractEventLike } from '../src/events';

function rawEvent(topic: xdr.ScVal[], overrides: Partial<RawContractEventLike> = {}): RawContractEventLike {
  return {
    ledger: 12345,
    ledgerClosedAt: '2026-07-21T00:00:00Z',
    contractId: 'CABCDEF',
    id: '0000012345-0000000001',
    topic,
    ...overrides,
  };
}

describe('deserializeContractEvent', () => {
  it('returns undefined for a topic with fewer than 2 segments', () => {
    const event = rawEvent([xdr.ScVal.scvSymbol('lineproof.queue')]);
    expect(deserializeContractEvent(event)).toBeUndefined();
  });

  it('returns undefined for an unrecognized namespace', () => {
    const event = rawEvent([xdr.ScVal.scvSymbol('some.other.contract'), xdr.ScVal.scvSymbol('Whatever')]);
    expect(deserializeContractEvent(event)).toBeUndefined();
  });

  it('returns undefined for an unrecognized kind within a known namespace', () => {
    const event = rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('NotARealKind')]);
    expect(deserializeContractEvent(event)).toBeUndefined();
  });

  it('deserializes a lineproof.queue:Advanced event, decoding positionId from the third topic segment', () => {
    const event = rawEvent([
      xdr.ScVal.scvSymbol('lineproof.queue'),
      xdr.ScVal.scvSymbol('Advanced'),
      xdr.ScVal.scvU32(7),
    ]);
    const result = deserializeContractEvent(event);
    expect(result).toBeDefined();
    expect(result?.namespace).toBe('lineproof.queue');
    expect(result?.kind).toBe('Advanced');
    expect(result).toMatchObject({ positionId: 7, ledger: 12345, contractId: 'CABCDEF' });
  });

  it('deserializes a lineproof.queue:Initialized event with no extra topic data', () => {
    const event = rawEvent([xdr.ScVal.scvSymbol('lineproof.queue'), xdr.ScVal.scvSymbol('Initialized')]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({ namespace: 'lineproof.queue', kind: 'Initialized' });
  });

  it('deserializes a lineproof.enrollment:Enrolled event, decoding identity and proofHash when present', () => {
    const event = rawEvent([
      xdr.ScVal.scvSymbol('lineproof.enrollment'),
      xdr.ScVal.scvSymbol('Enrolled'),
      xdr.ScVal.scvString('GABCDEF_IDENTITY'),
      xdr.ScVal.scvString('proof-hash-abc'),
    ]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({
      namespace: 'lineproof.enrollment',
      kind: 'Enrolled',
      identity: 'GABCDEF_IDENTITY',
      proofHash: 'proof-hash-abc',
    });
  });

  it('defaults identity/proofHash to empty strings when the topic carries no extra data (current on-chain behavior)', () => {
    // The deployed contracts' emit() helpers currently only publish
    // (namespace, kind, queue_id) — identity/proofHash are accepted but
    // unused. See contracts/lineproof-enrollment/src/lib.rs `fn emit`.
    const event = rawEvent([
      xdr.ScVal.scvSymbol('lineproof.enrollment'),
      xdr.ScVal.scvSymbol('Enrolled'),
      xdr.ScVal.scvSymbol('some-queue-id'),
    ]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({ namespace: 'lineproof.enrollment', kind: 'Enrolled' });
    expect((result as { identity?: string })?.identity).toBe('some-queue-id');
    expect((result as { proofHash?: string })?.proofHash).toBe('');
  });

  it('deserializes a lineproof.escrow:Deposited event, decoding amount as a bigint', () => {
    const event = rawEvent([
      xdr.ScVal.scvSymbol('lineproof.escrow'),
      xdr.ScVal.scvSymbol('Deposited'),
      xdr.ScVal.scvString('GABCDEF_IDENTITY'),
      xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('5000000') })),
    ]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({ namespace: 'lineproof.escrow', kind: 'Deposited', identity: 'GABCDEF_IDENTITY' });
    expect((result as { amount?: bigint })?.amount).toBe(5000000n);
  });

  it('deserializes a lineproof.identity:TransferReverted event with from/to', () => {
    const event = rawEvent([
      xdr.ScVal.scvSymbol('lineproof.identity'),
      xdr.ScVal.scvSymbol('TransferReverted'),
      xdr.ScVal.scvString('GFROM'),
      xdr.ScVal.scvString('GTO'),
    ]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({
      namespace: 'lineproof.identity',
      kind: 'TransferReverted',
      from: 'GFROM',
      to: 'GTO',
    });
  });

  it('deserializes a lineproof.factory:Deployed event, falling back to the raw contractId when the topic omits it', () => {
    const event = rawEvent(
      [
        xdr.ScVal.scvSymbol('lineproof.factory'),
        xdr.ScVal.scvSymbol('Deployed'),
        xdr.ScVal.scvString('my-queue-slug'),
      ],
      { contractId: 'CFALLBACK' },
    );
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({
      namespace: 'lineproof.factory',
      kind: 'Deployed',
      slug: 'my-queue-slug',
      contractId: 'CFALLBACK',
    });
  });

  it('accepts raw base64-XDR string topic segments as well as parsed ScVal instances', () => {
    const namespaceB64 = xdr.ScVal.scvSymbol('lineproof.queue').toXDR('base64');
    const kindB64 = xdr.ScVal.scvSymbol('QueueClosed').toXDR('base64');
    const event = rawEvent([namespaceB64 as unknown as xdr.ScVal, kindB64 as unknown as xdr.ScVal]);
    const result = deserializeContractEvent(event);
    expect(result).toMatchObject({ namespace: 'lineproof.queue', kind: 'QueueClosed' });
  });
});
