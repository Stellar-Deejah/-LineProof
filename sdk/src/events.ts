/**
 * Event type definitions for LineProof contract events.
 * These mirror the on-chain event topics emitted by each contract.
 */
import { xdr, scValToNative } from '@stellar/stellar-sdk';

export type EventNamespace =
  | 'lineproof.queue'
  | 'lineproof.enrollment'
  | 'lineproof.escrow'
  | 'lineproof.identity'
  | 'lineproof.factory';

export interface LineProofRawEvent {
  namespace: EventNamespace;
  kind: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  data: unknown;
}

// ── Queue events ──────────────────────────────────────────────────────────────
export interface QueueInitializedEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'Initialized';
}

export interface EnrollmentOpenedEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'EnrollmentOpened';
}

export interface EnrollmentClosedEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'EnrollmentClosed';
}

export interface PositionAdvancedEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'Advanced';
  positionId: number;
}

export interface PositionExpiredEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'Expired';
  positionId: number;
}

export interface QueueClosedEvent extends LineProofRawEvent {
  namespace: 'lineproof.queue';
  kind: 'QueueClosed';
}

// ── Enrollment events ─────────────────────────────────────────────────────────
export interface EnrolledEvent extends LineProofRawEvent {
  namespace: 'lineproof.enrollment';
  kind: 'Enrolled';
  identity: string;
  proofHash: string;
}

export interface EnrollmentCancelledEvent extends LineProofRawEvent {
  namespace: 'lineproof.enrollment';
  kind: 'Cancelled';
  identity: string;
}

export interface EnrollmentFinalizedEvent extends LineProofRawEvent {
  namespace: 'lineproof.enrollment';
  kind: 'Finalized';
  identity: string;
}

// ── Escrow events ─────────────────────────────────────────────────────────────
export interface EscrowDepositedEvent extends LineProofRawEvent {
  namespace: 'lineproof.escrow';
  kind: 'Deposited';
  identity: string;
  amount: bigint;
}

export interface EscrowReleasedEvent extends LineProofRawEvent {
  namespace: 'lineproof.escrow';
  kind: 'Released';
  identity: string;
  amount: bigint;
}

export interface EscrowRefundedEvent extends LineProofRawEvent {
  namespace: 'lineproof.escrow';
  kind: 'Refunded';
  identity: string;
  amount: bigint;
}

export interface EscrowExpiredEvent extends LineProofRawEvent {
  namespace: 'lineproof.escrow';
  kind: 'Expired';
  identity: string;
  amount: bigint;
}

// ── Identity events ───────────────────────────────────────────────────────────
export interface IdentityBoundEvent extends LineProofRawEvent {
  namespace: 'lineproof.identity';
  kind: 'Bound';
  identity: string;
}

export interface IdentityUnboundEvent extends LineProofRawEvent {
  namespace: 'lineproof.identity';
  kind: 'Unbound';
  identity: string;
}

export interface TransferRevertedEvent extends LineProofRawEvent {
  namespace: 'lineproof.identity';
  kind: 'TransferReverted';
  from: string;
  to: string;
}

// ── Factory events ────────────────────────────────────────────────────────────
export interface QueueDeployedEvent extends LineProofRawEvent {
  namespace: 'lineproof.factory';
  kind: 'Deployed';
  slug: string;
  contractId: string;
  version: number;
}

export interface QueueRegisteredEvent extends LineProofRawEvent {
  namespace: 'lineproof.factory';
  kind: 'Registered';
  slug: string;
}

export type AnyLineProofEvent =
  | QueueInitializedEvent | EnrollmentOpenedEvent | EnrollmentClosedEvent
  | PositionAdvancedEvent | PositionExpiredEvent | QueueClosedEvent
  | EnrolledEvent | EnrollmentCancelledEvent | EnrollmentFinalizedEvent
  | EscrowDepositedEvent | EscrowReleasedEvent | EscrowRefundedEvent | EscrowExpiredEvent
  | IdentityBoundEvent | IdentityUnboundEvent | TransferRevertedEvent
  | QueueDeployedEvent | QueueRegisteredEvent;

// ── getEvents() filtering ───────────────────────────────────────────────────

export interface EventFilter {
  /** Restrict to events emitted by these contract IDs. */
  contractIds?: string[];
  /** Restrict to these event namespaces after decoding. */
  namespaces?: EventNamespace[];
  /** Ledger to start from. Ignored when `cursor` is set. Default: 0 (RPC-defined retention window). */
  startLedger?: number;
  /** Opaque cursor from a previous `Page.nextCursor` (see pagination.ts). */
  cursor?: string;
  /** Max events per page. Default: 50, max: 200 (see pagination.ts `paginate`). */
  limit?: number;
}

// ── Deserialization from Soroban RPC ────────────────────────────────────────

/**
 * Minimal shape this SDK relies on from `SorobanRpc.Server.getEvents()`'s
 * response `events` array. Declared locally (rather than imported from
 * `@stellar/stellar-sdk`) because the exact exported type name has moved
 * between SDK versions; duck-typing this interface is more resilient than
 * pinning to one. `topic` and `value` entries may be either already-parsed
 * `xdr.ScVal` instances or raw base64 XDR strings — `decodeTopicSegment`
 * below handles both.
 */
export interface RawContractEventLike {
  ledger: number;
  ledgerClosedAt: string;
  contractId?: string;
  id: string;
  topic: unknown[];
  value?: unknown;
}

const EVENT_NAMESPACES: readonly EventNamespace[] = [
  'lineproof.queue',
  'lineproof.enrollment',
  'lineproof.escrow',
  'lineproof.identity',
  'lineproof.factory',
];

function isEventNamespace(value: string): value is EventNamespace {
  return (EVENT_NAMESPACES as readonly string[]).includes(value);
}

/** Decodes one topic/value segment (parsed ScVal or raw base64 XDR) into a native JS value. */
function decodeTopicSegment(segment: unknown): unknown {
  if (typeof segment === 'string') {
    try {
      return scValToNative(xdr.ScVal.fromXDR(segment, 'base64'));
    } catch {
      return segment;
    }
  }
  try {
    return scValToNative(segment as xdr.ScVal);
  } catch {
    return segment;
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toString?: unknown }).toString === 'function') {
    const stringified = String(value);
    if (stringified !== '[object Object]') return stringified;
  }
  return '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return 0;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
}

/**
 * Maps decoded namespace/kind + any extra topic segments onto the specific
 * `AnyLineProofEvent` member. As of this writing, every LineProof contract's
 * `emit()` helper (see e.g. `contracts/lineproof-escrow/src/lib.rs`) only
 * publishes a 3-part topic — `(namespace, kind, queue_id)` — and does not
 * yet include identity/amount/proofHash/etc. in the topic or event data, even
 * though those parameters are accepted by `emit()`. Until the contracts are
 * updated to publish that data, the corresponding typed fields below (e.g.
 * `EnrolledEvent.identity`) will decode to their zero value (`''`/`0n`)
 * rather than throw — callers needing that data today must still look it up
 * via `simulateContractCall`/`getPosition`-style reads.
 */
function attachTypedFields(
  base: LineProofRawEvent,
  extraTopics: unknown[],
): AnyLineProofEvent | undefined {
  switch (`${base.namespace}:${base.kind}`) {
    case 'lineproof.queue:Initialized':
      return { ...base, namespace: 'lineproof.queue', kind: 'Initialized' };
    case 'lineproof.queue:EnrollmentOpened':
      return { ...base, namespace: 'lineproof.queue', kind: 'EnrollmentOpened' };
    case 'lineproof.queue:EnrollmentClosed':
      return { ...base, namespace: 'lineproof.queue', kind: 'EnrollmentClosed' };
    case 'lineproof.queue:Advanced':
      return { ...base, namespace: 'lineproof.queue', kind: 'Advanced', positionId: asNumber(extraTopics[0]) };
    case 'lineproof.queue:QueueClosed':
      return { ...base, namespace: 'lineproof.queue', kind: 'QueueClosed' };

    case 'lineproof.enrollment:Enrolled':
      return {
        ...base,
        namespace: 'lineproof.enrollment',
        kind: 'Enrolled',
        identity: asString(extraTopics[0]),
        proofHash: asString(extraTopics[1]),
      };
    case 'lineproof.enrollment:Cancelled':
      return { ...base, namespace: 'lineproof.enrollment', kind: 'Cancelled', identity: asString(extraTopics[0]) };
    case 'lineproof.enrollment:Finalized':
      return { ...base, namespace: 'lineproof.enrollment', kind: 'Finalized', identity: asString(extraTopics[0]) };

    case 'lineproof.escrow:Deposited':
      return {
        ...base,
        namespace: 'lineproof.escrow',
        kind: 'Deposited',
        identity: asString(extraTopics[0]),
        amount: asBigInt(extraTopics[1]),
      };
    case 'lineproof.escrow:Released':
      return {
        ...base,
        namespace: 'lineproof.escrow',
        kind: 'Released',
        identity: asString(extraTopics[0]),
        amount: asBigInt(extraTopics[1]),
      };
    case 'lineproof.escrow:Refunded':
      return {
        ...base,
        namespace: 'lineproof.escrow',
        kind: 'Refunded',
        identity: asString(extraTopics[0]),
        amount: asBigInt(extraTopics[1]),
      };
    case 'lineproof.escrow:Expired':
      return {
        ...base,
        namespace: 'lineproof.escrow',
        kind: 'Expired',
        identity: asString(extraTopics[0]),
        amount: asBigInt(extraTopics[1]),
      };

    case 'lineproof.identity:Bound':
      return { ...base, namespace: 'lineproof.identity', kind: 'Bound', identity: asString(extraTopics[0]) };
    case 'lineproof.identity:Unbound':
      return { ...base, namespace: 'lineproof.identity', kind: 'Unbound', identity: asString(extraTopics[0]) };
    case 'lineproof.identity:TransferReverted':
      return {
        ...base,
        namespace: 'lineproof.identity',
        kind: 'TransferReverted',
        from: asString(extraTopics[0]),
        to: asString(extraTopics[1]),
      };

    case 'lineproof.factory:Deployed':
      return {
        ...base,
        namespace: 'lineproof.factory',
        kind: 'Deployed',
        slug: asString(extraTopics[0]),
        contractId: asString(extraTopics[1]) || base.contractId,
        version: asNumber(extraTopics[2]),
      };
    case 'lineproof.factory:Registered':
      return { ...base, namespace: 'lineproof.factory', kind: 'Registered', slug: asString(extraTopics[0]) };

    default:
      // Not a recognized LineProof namespace+kind pair — e.g. a diagnostic
      // event from an unrelated contract sharing the same RPC filter.
      return undefined;
  }
}

/**
 * Deserializes one raw Soroban RPC event into a typed `AnyLineProofEvent`,
 * or `undefined` if it isn't a recognized LineProof event (wrong namespace,
 * unknown kind, or malformed topic). See `attachTypedFields` for the
 * per-event-type field mapping and its current data-availability caveat.
 */
export function deserializeContractEvent(raw: RawContractEventLike): AnyLineProofEvent | undefined {
  if (!Array.isArray(raw.topic) || raw.topic.length < 2) return undefined;

  const namespace = decodeTopicSegment(raw.topic[0]);
  const kind = decodeTopicSegment(raw.topic[1]);
  if (typeof namespace !== 'string' || !isEventNamespace(namespace) || typeof kind !== 'string') {
    return undefined;
  }

  const extraTopics = raw.topic.slice(2).map(decodeTopicSegment);
  const value = raw.value !== undefined ? decodeTopicSegment(raw.value) : undefined;

  const base: LineProofRawEvent = {
    namespace,
    kind,
    ledger: raw.ledger,
    ledgerClosedAt: raw.ledgerClosedAt,
    contractId: raw.contractId ?? '',
    data: { topics: extraTopics, value },
  };

  return attachTypedFields(base, extraTopics);
}
