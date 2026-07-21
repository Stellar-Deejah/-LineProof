import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
  assertValidAddress,
  toStroops,
  fromStroops,
  nowSeconds,
  daysFromNow,
  truncateAddress,
  generateTestKeypair,
} from '../src/utils';
import { SDKError } from '../src/types';

describe('assertValidAddress', () => {
  it('does not throw for a real valid Stellar public key', () => {
    const key = Keypair.random().publicKey();
    expect(() => assertValidAddress(key)).not.toThrow();
  });

  it('throws SDKError for a non-G-prefix key', () => {
    expect(() => assertValidAddress('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow(SDKError);
  });

  it('throws SDKError for a malformed key', () => {
    expect(() => assertValidAddress('NOTAKEY')).toThrow(SDKError);
  });
});

describe('toStroops / fromStroops', () => {
  it('converts 1.0 to 10000000 stroops', () => {
    expect(toStroops(1.0)).toBe(10_000_000n);
  });

  it('converts 0.5 to 5000000 stroops', () => {
    expect(toStroops(0.5)).toBe(5_000_000n);
  });

  it('converts back from stroops to readable', () => {
    expect(fromStroops(10_000_000n)).toBe('1');
    expect(fromStroops(5_000_000n)).toBe('0.5');
  });

  it('throws for negative amounts', () => {
    expect(() => toStroops(-1)).toThrow(SDKError);
  });
});

describe('nowSeconds', () => {
  it('returns a number close to Date.now() / 1000', () => {
    const expected = Math.floor(Date.now() / 1000);
    expect(Math.abs(nowSeconds() - expected)).toBeLessThanOrEqual(1);
  });
});

describe('daysFromNow', () => {
  it('returns nowSeconds + days * 86400', () => {
    const now = nowSeconds();
    expect(daysFromNow(1)).toBeGreaterThanOrEqual(now + 86400 - 1);
    expect(daysFromNow(1)).toBeLessThanOrEqual(now + 86400 + 1);
  });
});

describe('truncateAddress', () => {
  it('truncates a long address with ellipsis', () => {
    const addr = 'G' + 'A'.repeat(55);
    const result = truncateAddress(addr, 6);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(addr.length);
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('GABC', 6)).toBe('GABC');
  });
});

describe('generateTestKeypair', () => {
  it('returns a publicKey starting with G', () => {
    const kp = generateTestKeypair();
    expect(kp.publicKey).toMatch(/^G/);
  });

  it('returns a secretKey starting with S', () => {
    const kp = generateTestKeypair();
    expect(kp.secretKey).toMatch(/^S/);
  });

  it('returns different keypairs on each call', () => {
    const kp1 = generateTestKeypair();
    const kp2 = generateTestKeypair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});

describe('toStroops precision and validation (issue #88)', () => {
  it('converts one stroop from a string without truncating to zero', () => {
    expect(toStroops('0.0000001')).toBe(1n);
  });

  it('converts one stroop from a number without floating-point truncation', () => {
    // The old implementation computed BigInt(Math.round(0.0000001 * 10_000_000)).
    // Float multiplication makes that fragile; parsing the digits is exact.
    expect(toStroops(0.0000001)).toBe(1n);
  });

  it('accepts both string and number input for the same value', () => {
    expect(toStroops('123.456789')).toBe(toStroops(123.456789));
    expect(toStroops('1')).toBe(10_000_000n);
  });

  it('is exact for values a float cannot represent cleanly', () => {
    expect(toStroops('0.1')).toBe(1_000_000n);
    expect(toStroops('0.3')).toBe(3_000_000n);
    expect(toStroops('1.0000001')).toBe(10_000_001n);
  });

  it('throws SDKError for NaN', () => {
    expect(() => toStroops(NaN)).toThrow(SDKError);
  });

  it('throws SDKError for Infinity', () => {
    expect(() => toStroops(Infinity)).toThrow(SDKError);
    expect(() => toStroops(-Infinity)).toThrow(SDKError);
  });

  it('throws SDKError for malformed strings and excess precision', () => {
    expect(() => toStroops('abc')).toThrow(SDKError);
    expect(() => toStroops('1e5')).toThrow(SDKError);
    expect(() => toStroops('')).toThrow(SDKError);
    expect(() => toStroops('0.12345678')).toThrow(SDKError); // 8 decimals
  });

  it('throws SDKError for amounts beyond i128', () => {
    expect(() => toStroops('1' + '0'.repeat(40))).toThrow(SDKError);
  });
});

describe('fromStroops (issue #88)', () => {
  it('formats one stroop', () => {
    expect(fromStroops(1n)).toBe('0.0000001');
  });

  it('formats whole units without a fractional part', () => {
    expect(fromStroops(10_000_000n)).toBe('1');
    expect(fromStroops(0n)).toBe('0');
  });

  it('trims trailing zeros but keeps significant digits', () => {
    expect(fromStroops(1_234_567_890n)).toBe('123.456789');
    expect(fromStroops(5_000_000n)).toBe('0.5');
  });

  it('round-trips through toStroops', () => {
    expect(fromStroops(toStroops('123.4567890'))).toBe('123.456789');
    expect(fromStroops(toStroops('0.0000001'))).toBe('0.0000001');
    expect(fromStroops(toStroops(1))).toBe('1');
  });

  it('handles large amounts near the i128 boundary', () => {
    const large = '170141183460469231731';
    expect(fromStroops(toStroops(large))).toBe(large);
  });
});
