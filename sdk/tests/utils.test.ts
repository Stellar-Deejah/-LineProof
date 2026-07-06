import { describe, it, expect } from 'vitest';
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
  it('does not throw for a valid 56-char G-prefixed key', () => {
    expect(() => assertValidAddress('G' + 'A'.repeat(55))).not.toThrow();
  });

  it('throws SDKError for a non-G-prefix key', () => {
    expect(() => assertValidAddress('BABC123')).toThrow(SDKError);
  });

  it('throws SDKError for a key that is too short', () => {
    expect(() => assertValidAddress('GABC')).toThrow(SDKError);
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
