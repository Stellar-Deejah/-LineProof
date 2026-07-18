import { z } from 'zod';

/**
 * Zod schema for Stellar public key validation.
 * Matches the format: G followed by 55 alphanumeric characters (A-Z, 2-7)
 */
export const StellarAddress = z.string().regex(/^G[A-Z2-7]{55}$/, {
  message: 'Invalid Stellar address. Must be a 56-character G-prefixed key.',
});

/**
 * Type inference from StellarAddress schema
 */
export type StellarAddress = z.infer<typeof StellarAddress>;
