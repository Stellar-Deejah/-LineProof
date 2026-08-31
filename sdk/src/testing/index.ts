import { Keypair } from '@stellar/stellar-sdk';

/** Generates a random Stellar keypair (for testing only — never for production keys). */
export function generateTestKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.random();
  return { publicKey: kp.publicKey(), secretKey: kp.secret() };
}
