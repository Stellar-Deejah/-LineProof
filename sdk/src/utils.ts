/**
 * Utility helpers for the LineProof SDK.
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { SDKError } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Retry & Timeout Infrastructure (Issue #37)
// ═══════════════════════════════════════════════════════════════════════════════

export enum ErrorCategory {
  /** Transient network errors — safe to retry */
  RETRYABLE_NETWORK = 'RETRYABLE_NETWORK',
  /** Sequence mismatch — requires account re-fetch before retry */
  RETRYABLE_SEQUENCE = 'RETRYABLE_SEQUENCE',
  /** Insufficient fee / resources — may be retried with higher fee */
  RETRYABLE_INSUFFICIENT = 'RETRYABLE_INSUFFICIENT',
  /** Invalid transaction (4xx, bad auth, malformed) — never retry */
  TERMINAL_INVALID = 'TERMINAL_INVALID',
  /** Unknown — conservative: retry once, then fail */
  UNKNOWN = 'UNKNOWN',
}

export interface RetryConfig {
  maxRetries: number;
  timeoutMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  timeoutMs: 30_000,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  jitterFactor: 0.5,
};

const SEQUENCE_ERROR_CODES = [
  'tx_bad_seq', 'TX_BAD_SEQ', 'tx_bad_seq_no_entry',
];

const INSUFFICIENT_ERROR_CODES = [
  'tx_insufficient_fee', 'tx_insufficient_balance',
  'TX_INSUFFICIENT_FEE', 'INSUFFICIENT_BALANCE', 'INSUFFICIENT_FEE',
  'tx_too_late', 'TX_TOO_LATE',
];

const INVALID_ERROR_CODES = [
  'tx_bad_auth', 'tx_bad_auth_extra', 'TX_BAD_AUTH',
  'tx_missing_operation', 'TX_MISSING_OPERATION',
  'tx_bad_min_seq_age_or_gap', 'TX_BAD_MIN_SEQ_AGE_OR_GAP',
  'tx_malformed', 'TX_MALFORMED',
  'op_no_source_account', 'op_not_supported', 'op_bad_auth',
  'op_src_no_trust', 'op_line_full', 'op_no_issuer',
  'op_not_authorized', 'op_exceeded_work_limit',
];

const NETWORK_ERROR_CODES = [
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
  'EPIPE', 'ENETUNREACH', 'EAI_AGAIN',
];

const RETRYABLE_HTTP_STATUS = [408, 429, 500, 502, 503, 504];
const TERMINAL_HTTP_STATUS = [400, 401, 403, 404, 405, 409, 410, 422];

/**
 * Classify an error from submitTransaction() or Soroban RPC.
 */
export function classifyError(error: unknown): ErrorCategory {
  if (!(error instanceof Error)) return ErrorCategory.UNKNOWN;

  const msg = error.message.toLowerCase();
  const code = (error as any).code || (error as any).status || '';
  const extras = (error as any).extras;
  const resultCodes = extras?.result_codes;
  const httpStatus = (error as any).status;
  const response = (error as any).response;
  const responseStatus = response?.status;

  // 1. Explicit Soroban/Horizon result codes
  if (resultCodes) {
    const txCode = resultCodes.transaction;
    if (txCode) {
      if (SEQUENCE_ERROR_CODES.includes(txCode)) return ErrorCategory.RETRYABLE_SEQUENCE;
      if (INVALID_ERROR_CODES.includes(txCode)) return ErrorCategory.TERMINAL_INVALID;
      if (INSUFFICIENT_ERROR_CODES.includes(txCode)) return ErrorCategory.RETRYABLE_INSUFFICIENT;
    }
    const opCodes: string[] = resultCodes.operations || [];
    for (const opCode of opCodes) {
      if (INVALID_ERROR_CODES.includes(opCode)) return ErrorCategory.TERMINAL_INVALID;
    }
  }

  // 2. HTTP status codes
  const status = httpStatus || responseStatus;
  if (status) {
    if (TERMINAL_HTTP_STATUS.includes(Number(status))) return ErrorCategory.TERMINAL_INVALID;
    if (RETRYABLE_HTTP_STATUS.includes(Number(status))) return ErrorCategory.RETRYABLE_NETWORK;
  }

  // 3. Network-level error codes
  if (typeof code === 'string' && NETWORK_ERROR_CODES.includes(code)) {
    return ErrorCategory.RETRYABLE_NETWORK;
  }

  // 4. Message pattern matching
  if (msg.includes('bad sequence') || msg.includes('tx_bad_seq')) {
    return ErrorCategory.RETRYABLE_SEQUENCE;
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return ErrorCategory.RETRYABLE_NETWORK;
  }
  if (msg.includes('network') || msg.includes('connection') || msg.includes('econn')) {
    return ErrorCategory.RETRYABLE_NETWORK;
  }
  if (msg.includes('insufficient') && (msg.includes('fee') || msg.includes('balance'))) {
    return ErrorCategory.RETRYABLE_INSUFFICIENT;
  }
  if (msg.includes('invalid') || msg.includes('malformed') || msg.includes('bad auth')) {
    return ErrorCategory.TERMINAL_INVALID;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Calculate delay with blended jitter for exponential backoff.
 *
 * Algorithm: delay = capped * (1 - jitterFactor) + capped * jitterFactor * random()
 *
 * With jitterFactor=0.5 (default):
 *   - 50% deterministic minimum wait (prevents too-aggressive retry)
 *   - 50% randomized spread (breaks thundering herd on RPC recovery)
 *
 * Why blended jitter instead of full jitter?
 * - Full jitter (random 0..capped) can retry too quickly
 * - No jitter causes synchronized retry storms
 * - Blended gives us a guaranteed floor + randomized ceiling
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = DEFAULT_RETRY_CONFIG.baseDelayMs,
  maxDelayMs: number = DEFAULT_RETRY_CONFIG.maxDelayMs,
  jitterFactor: number = DEFAULT_RETRY_CONFIG.jitterFactor,
): number {
  const exponential = baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, maxDelayMs);
  const deterministic = capped * (1 - jitterFactor);
  const jittered = capped * jitterFactor * Math.random();
  return Math.round(deterministic + jittered);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createTimeoutPromise(timeoutMs: number, signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Transaction submission timed out after ${timeoutMs}ms`);
      (error as any).code = 'ETIMEDOUT';
      (error as any).isTimeout = true;
      reject(error);
    }, timeoutMs);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      const error = new Error('Transaction submission aborted');
      (error as any).code = 'ABORTED';
      reject(error);
    });
  });
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalDurationMs: number;
}

export interface RetryContext {
  attempt: number;
  error: Error;
  category: ErrorCategory;
  willRetry: boolean;
  nextDelayMs: number;
}

export type SequenceRefetchFn = () => Promise<void>;
export type OnRetryFn = (ctx: RetryContext) => void;

/**
 * Execute an async function with retry logic, timeout enforcement, and
 * error classification.
 *
 * @param fn            Function to execute; receives AbortSignal
 * @param config        Retry configuration (partial)
 * @param sequenceRefetch  Called before retrying after tx_bad_seq
 * @param onRetry       Observer callback for each retry attempt
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: Partial<RetryConfig> = {},
  sequenceRefetch?: SequenceRefetchFn,
  onRetry?: OnRetryFn,
): Promise<RetryResult<T>> {
  const {
    maxRetries,
    timeoutMs,
    baseDelayMs,
    maxDelayMs,
    jitterFactor,
  } = { ...DEFAULT_RETRY_CONFIG, ...config };

  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const abortController = new AbortController();

    try {
      const result = await Promise.race([
        fn(abortController.signal),
        createTimeoutPromise(timeoutMs, abortController.signal),
      ]);

      return {
        result,
        attempts: attempt + 1,
        totalDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const category = classifyError(lastError);

      // Terminal errors: never retry
      if (category === ErrorCategory.TERMINAL_INVALID) {
        throw lastError;
      }

      // Exhausted retries
      if (attempt >= maxRetries) {
        throw lastError;
      }

      const nextDelayMs = calculateBackoff(attempt, baseDelayMs, maxDelayMs, jitterFactor);

      if (onRetry) {
        onRetry({ attempt, error: lastError, category, willRetry: true, nextDelayMs });
      }

      // Sequence mismatch: re-fetch before waiting
      if (category === ErrorCategory.RETRYABLE_SEQUENCE && sequenceRefetch) {
        try {
          await sequenceRefetch();
        } catch (refetchError) {
          const re = refetchError instanceof Error ? refetchError : new Error(String(refetchError));
          throw new SDKError(
            'SEQUENCE_REFETCH_FAILED',
            `Failed to re-fetch account sequence after tx_bad_seq: ${re.message}`,
            { cause: re.message },
          );
        }
      }

      await sleep(nextDelayMs);
    }
  }

  throw lastError || new SDKError('RETRY_EXHAUSTED', 'Retry loop exhausted with no captured error');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Existing Utility Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Validates that a string is a valid Stellar Ed25519 public key (checksum verified). */
export function assertValidAddress(address: string, fieldName = 'address'): void {
  if (typeof address !== 'string' || !StrKey.isValidEd25519PublicKey(address)) {
    throw new SDKError(
      'INVALID_ADDRESS',
      `${fieldName} must be a valid Stellar public key`,
      { value: address },
    );
  }
}

/** Converts a readable asset amount to stroops (7 decimal places). */
export function toStroops(amount: number): bigint {
  if (amount < 0) throw new SDKError('INVALID_AMOUNT', 'Amount must be non-negative');
  return BigInt(Math.round(amount * 10_000_000));
}

/** Converts stroops back to a human-readable decimal string. */
export function fromStroops(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = stroops % 10_000_000n;
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

/** Returns the current Unix timestamp in seconds. */
export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Returns a Unix timestamp N days from now. */
export function daysFromNow(days: number): number {
  return nowSeconds() + days * 86400;
}

/** Truncates a long Stellar address for display: GABCD…WXYZ */
export function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Generates a random Stellar keypair (for testing only — never for production keys). */
export function generateTestKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}