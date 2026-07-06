import { describe, it, expect } from 'vitest';
import {
  SDKError,
  validateAddress,
  isNetworkPassphrase,
  NetworkPassphrase,
  QueueStatus,
  EscrowStatus,
  AdvancementRule,
} from '../src/types';

describe('SDKError', () => {
  it('formats message with code prefix', () => {
    const err = new SDKError('SOME_CODE', 'Something went wrong');
    expect(err.message).toBe('[SOME_CODE] Something went wrong');
    expect(err.name).toBe('LineProofSDKError');
    expect(err.code).toBe('SOME_CODE');
  });

  it('accepts optional details', () => {
    const err = new SDKError('ERR', 'msg', { key: 'value' });
    expect(err.details).toEqual({ key: 'value' });
  });
});

describe('validateAddress', () => {
  it('does not throw for a valid G-prefixed key', () => {
    expect(() => validateAddress('G' + 'A'.repeat(55))).not.toThrow();
  });

  it('throws SDKError for an invalid address', () => {
    expect(() => validateAddress('INVALID')).toThrow(SDKError);
  });
});

describe('isNetworkPassphrase', () => {
  it('returns true for TESTNET passphrase', () => {
    expect(isNetworkPassphrase(NetworkPassphrase.TESTNET)).toBe(true);
  });

  it('returns true for MAINNET passphrase', () => {
    expect(isNetworkPassphrase(NetworkPassphrase.MAINNET)).toBe(true);
  });

  it('returns false for arbitrary strings', () => {
    expect(isNetworkPassphrase('random text')).toBe(false);
  });
});

describe('NetworkPassphrase enum', () => {
  it('has expected TESTNET value', () => {
    expect(NetworkPassphrase.TESTNET).toBe('Test SDF Network ; September 2015');
  });

  it('has expected MAINNET value', () => {
    expect(NetworkPassphrase.MAINNET).toBe('Public Global Stellar Network ; September 2015');
  });
});

describe('QueueStatus enum', () => {
  it('covers all lifecycle states', () => {
    const states = Object.values(QueueStatus);
    expect(states).toContain('Draft');
    expect(states).toContain('EnrollmentOpen');
    expect(states).toContain('EnrollmentClosed');
    expect(states).toContain('AdvancementActive');
    expect(states).toContain('Closed');
  });
});

describe('EscrowStatus enum', () => {
  it('covers all escrow states', () => {
    expect(EscrowStatus.Active).toBe('active');
    expect(EscrowStatus.Released).toBe('released');
    expect(EscrowStatus.Refunded).toBe('refunded');
    expect(EscrowStatus.Expired).toBe('expired');
  });
});

describe('AdvancementRule enum', () => {
  it('includes FIFO, PRIORITY, and VRF variants', () => {
    expect(AdvancementRule.FIRST_IN_FIRST_OUT).toBe('FIFO');
    expect(AdvancementRule.PRIORITY_TIER).toBe('PRIORITY');
    expect(AdvancementRule.VERIFIABLE_RANDOMNESS).toBe('VRF');
  });
});
