import { describe, it, expect } from 'vitest';
import { isValidStellarAddress, STELLAR_PUBLIC_KEY_RE } from './stellar';

describe('isValidStellarAddress', () => {
  describe('invalid keys — digits 0, 1, 8, 9 are not valid in Stellar base32', () => {
    it('rejects a key composed entirely of 0s', () => {
      expect(isValidStellarAddress(`G${'0'.repeat(55)}`)).toBe(false);
    });

    it('rejects a key composed entirely of 1s', () => {
      expect(isValidStellarAddress(`G${'1'.repeat(55)}`)).toBe(false);
    });

    it('rejects a key composed entirely of 8s', () => {
      expect(isValidStellarAddress(`G${'8'.repeat(55)}`)).toBe(false);
    });

    it('rejects a key composed entirely of 9s', () => {
      expect(isValidStellarAddress(`G${'9'.repeat(55)}`)).toBe(false);
    });

    it('rejects a key where the last character is 0', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(54)}0`)).toBe(false);
    });

    it('rejects a key where the last character is 1', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(54)}1`)).toBe(false);
    });

    it('rejects a key where the last character is 8', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(54)}8`)).toBe(false);
    });
  });

  describe('valid keys — all characters within G + [A-Z2-7]{55}', () => {
    it('accepts a key composed entirely of A', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(55)}`)).toBe(true);
    });

    it('accepts a key composed entirely of 2 (valid base32 digit)', () => {
      expect(isValidStellarAddress(`G${'2'.repeat(55)}`)).toBe(true);
    });

    it('accepts a key composed entirely of 7 (valid base32 digit)', () => {
      expect(isValidStellarAddress(`G${'7'.repeat(55)}`)).toBe(true);
    });

    it('accepts a key with a realistic mix of valid A-Z and 2-7 characters', () => {
      const body = 'ABCDEFG2345672ABCDEFG2345672ABCDEFG2345672ABCDEFG234567';
      expect(body).toHaveLength(55);
      expect(isValidStellarAddress(`G${body}`)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('rejects an empty string', () => {
      expect(isValidStellarAddress('')).toBe(false);
    });

    it('rejects a bare G with no suffix', () => {
      expect(isValidStellarAddress('G')).toBe(false);
    });

    it('rejects a key that is one character too short (55 total)', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(54)}`)).toBe(false);
    });

    it('rejects a key that is one character too long (57 total)', () => {
      expect(isValidStellarAddress(`G${'A'.repeat(56)}`)).toBe(false);
    });

    it('rejects a key starting with lowercase g', () => {
      expect(isValidStellarAddress(`g${'A'.repeat(55)}`)).toBe(false);
    });

    it('rejects a key that does not start with G', () => {
      expect(isValidStellarAddress(`A${'A'.repeat(55)}`)).toBe(false);
    });
  });

  describe('STELLAR_PUBLIC_KEY_RE export', () => {
    it('is a RegExp', () => {
      expect(STELLAR_PUBLIC_KEY_RE).toBeInstanceOf(RegExp);
    });

    it('matches the same results as isValidStellarAddress', () => {
      const cases = [
        `G${'A'.repeat(55)}`,
        `G${'2'.repeat(55)}`,
        `G${'0'.repeat(55)}`,
        `G${'9'.repeat(55)}`,
        'GINVALID',
      ];
      for (const c of cases) {
        expect(STELLAR_PUBLIC_KEY_RE.test(c)).toBe(isValidStellarAddress(c));
      }
    });
  });
});
