/**
 * Shared Stellar public key validation for the frontend.
 * Matches the backend validateStellarAddress middleware regex exactly.
 *
 * Stellar Strkey encoding uses base32 with alphabet A-Z and 2-7.
 * Characters 0, 1, 8, 9 are NOT valid in Stellar public keys.
 */
export const STELLAR_PUBLIC_KEY_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(s: string): boolean {
  return STELLAR_PUBLIC_KEY_RE.test(s);
}
