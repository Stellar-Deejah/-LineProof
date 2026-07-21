/**
 * Utility helpers for the LineProof SDK.
 */

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { SDKError } from './types.js';

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

/** Number of decimal places in one unit. Stellar/Soroban use 7 (1 unit = 10^7 stroops). */
export const STROOP_SCALE = 7;
const STROOP_FACTOR = 10_000_000n;
/** Largest value representable by Soroban's i128 amount type. */
const I128_MAX = (1n << 127n) - 1n;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Converts a readable asset amount to integer stroops (7 decimal places).
 *
 * Accepts a decimal **string** (preferred — exact) or a number. The conversion
 * never multiplies a float by 10^7: the value is parsed as a decimal string and
 * assembled with BigInt arithmetic, so fractional amounts cannot be silently
 * truncated. `0.1 * 10_000_000` is not exactly `1_000_000` in IEEE-754, and
 * `Math.round` hides that; parsing the digits avoids the problem entirely.
 *
 * @throws SDKError('INVALID_AMOUNT') for NaN, Infinity, negatives, malformed
 * input, more than 7 decimal places, or values exceeding i128.
 */
export function toStroops(amount: string | number): bigint {
  let text: string;

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new SDKError('INVALID_AMOUNT', `Amount must be a finite number, received ${amount}`, {
        value: amount,
      });
    }
    // Render at fixed precision first so no float multiplication is involved.
    text = amount.toFixed(STROOP_SCALE);
  } else if (typeof amount === 'string') {
    text = amount.trim();
  } else {
    throw new SDKError('INVALID_AMOUNT', `Amount must be a string or number, received ${typeof amount}`, {
      value: amount as unknown,
    });
  }

  if (!DECIMAL_PATTERN.test(text)) {
    throw new SDKError('INVALID_AMOUNT', `Amount is not a plain decimal value: "${String(amount)}"`, {
      value: amount,
    });
  }
  if (text.startsWith('-')) {
    throw new SDKError('INVALID_AMOUNT', 'Amount must be non-negative', { value: amount });
  }

  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > STROOP_SCALE) {
    throw new SDKError(
      'INVALID_AMOUNT',
      `Amount "${String(amount)}" has ${fraction.length} decimal places; at most ${STROOP_SCALE} are supported`,
      { value: amount },
    );
  }

  const stroops = BigInt(whole) * STROOP_FACTOR + BigInt(fraction.padEnd(STROOP_SCALE, '0') || '0');
  if (stroops > I128_MAX) {
    throw new SDKError('INVALID_AMOUNT', 'Amount exceeds the maximum i128 value supported on Soroban', {
      value: amount,
    });
  }
  return stroops;
}

/** Converts stroops back to a human-readable decimal string. */
export function fromStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOP_FACTOR;
  const frac = abs % STROOP_FACTOR;
  const fracStr = frac.toString().padStart(STROOP_SCALE, '0').replace(/0+$/, '');
  const text = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${text}` : text;
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
