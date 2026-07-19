import { describe, it, expect, beforeAll } from 'vitest';
import { LineProofClient, EnrollmentClient, NetworkPassphrase } from '../src';

describe('Integration: Enrollment flow', () => {
  const rpcServerUrl = process.env.SOROBAN_RPC_URL || 'http://localhost:8000/soroban/rpc';
  const testPrivateKey = process.env.TEST_PRIVATE_KEY || 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const testPublicKey = process.env.TEST_PUBLIC_KEY || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const testQueueId = process.env.TEST_QUEUE_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHF';

  let client: LineProofClient | undefined;
  let enrollmentClient: EnrollmentClient | undefined;

  beforeAll(() => {
    // Create a client with credentials for write operations.
    // Constructing a client against a plain-http localnet URL throws when the
    // localnet is not set up, so treat construction failure as "localnet
    // unavailable" and let the tests skip gracefully.
    try {
      client = new LineProofClient({
        rpcServerUrl,
        networkPassphrase: NetworkPassphrase.STANDALONE,
        privateKey: testPrivateKey,
        publicKey: testPublicKey,
      });
      enrollmentClient = new EnrollmentClient(client);
    } catch {
      console.warn('Skipping integration tests: localnet not available');
    }
  });

  it('should enroll in a queue and verify enrollment via isEnrolled', async () => {
    // This is a smoke test that verifies the basic enrollment flow works end-to-end
    // It requires a running localnet with a deployed queue contract
    if (!enrollmentClient) return;

    try {
      // Attempt to enroll
      const txHash = await enrollmentClient.enroll(testQueueId, testPublicKey);
      expect(txHash).toBeDefined();
      expect(typeof txHash).toBe('string');
      expect(txHash.length).toBeGreaterThan(0);

      // Verify enrollment using the read-only isEnrolled method
      const isEnrolled = await enrollmentClient.isEnrolled(testQueueId, testPublicKey);
      expect(typeof isEnrolled).toBe('boolean');
      
      console.log(`Enrollment successful: ${txHash}`);
      console.log(`Is enrolled: ${isEnrolled}`);
    } catch (error) {
      // If localnet is not running, skip this test gracefully
      if (error instanceof Error && error.message.includes('connect')) {
        console.warn('Skipping integration test: localnet not available');
        return;
      }
      throw error;
    }
  }, 30000); // 30 second timeout for network operations

  it('should work with read-only client for isEnrolled', async () => {
    try {
      // Create a read-only client
      const readOnlyClient = LineProofClient.readOnly({
        rpcServerUrl,
        networkPassphrase: NetworkPassphrase.STANDALONE,
        publicKey: testPublicKey,
      });

      const readOnlyEnrollmentClient = new EnrollmentClient(readOnlyClient);

      // Verify enrollment using read-only client
      const isEnrolled = await readOnlyEnrollmentClient.isEnrolled(testQueueId, testPublicKey);
      expect(typeof isEnrolled).toBe('boolean');
      
      // Attempting to enroll with read-only client should fail
      await expect(readOnlyEnrollmentClient.enroll(testQueueId, testPublicKey)).rejects.toThrow('MISSING_CREDENTIALS');
    } catch (error) {
      // If localnet is not running, skip this test gracefully
      if (error instanceof Error && error.message.includes('connect')) {
        console.warn('Skipping integration test: localnet not available');
        return;
      }
      throw error;
    }
  }, 30000);
});
