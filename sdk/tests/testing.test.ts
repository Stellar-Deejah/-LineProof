import { describe, it, expect } from 'vitest';
import { generateTestKeypair } from '../src/testing/index.js';
import { StrKey } from '@stellar/stellar-sdk';

describe('generateTestKeypair', () => {
  it('returns valid Ed25519 public key', () => {
    const { publicKey } = generateTestKeypair();
    expect(StrKey.isValidEd25519PublicKey(publicKey)).toBe(true);
  });

  it('returns valid Secret key', () => {
    const { secretKey } = generateTestKeypair();
    expect(StrKey.isValidEd25519SecretSeed(secretKey)).toBe(true);
  });

  it('two calls return different keypairs', () => {
    const kp1 = generateTestKeypair();
    const kp2 = generateTestKeypair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
    expect(kp1.secretKey).not.toBe(kp2.secretKey);
  });
});
