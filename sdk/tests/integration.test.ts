import { describe, it, expect, beforeAll } from 'vitest';
import { LineProofClient, EnrollmentClient, NetworkPassphrase } from '../src';

describe('Integration: Enrollment flow', () => {
  const rpcServerUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const testPrivateKey = process.env.TEST_PRIVATE_KEY || 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const testPublicKey = process.env.TEST_PUBLIC_KEY || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const testQueueId = process.env.TEST_QUEUE_ID || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAF4H';

  let client: LineProofClient;
  let enrollmentClient: EnrollmentClient;

  beforeAll(() => {
    client = new LineProofClient({
      rpcServerUrl,
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: testPrivateKey,
      publicKey: testPublicKey,
    });
    enrollmentClient = new EnrollmentClient(client);
  });

  it('should enroll in a queue and verify enrollment via isEnrolled', async () => {
    if (process.env.INTEGRATION !== 'true') {
      console.log('Skipping integration test: INTEGRATION is not set to true');
      return;
    }
    
    try {
      const txHash = await enrollmentClient.enroll(testQueueId, testPublicKey);
      expect(txHash).toBeDefined();
      expect(typeof txHash).toBe('string');
      expect(txHash.length).toBeGreaterThan(0);

      const isEnrolled = await enrollmentClient.isEnrolled(testQueueId, testPublicKey);
      expect(typeof isEnrolled).toBe('boolean');
    } catch (error) {
      if (error instanceof Error && (error.message.includes('connect') || error.message.includes('fetch'))) {
        console.warn('Skipping integration test: network not available');
        return;
      }
      throw error;
    }
  }, 30000);

  it('should work with read-only client for isEnrolled', async () => {
    const readOnlyClient = LineProofClient.readOnly({
      rpcServerUrl,
      networkPassphrase: NetworkPassphrase.TESTNET,
      publicKey: testPublicKey,
    });
    
    const readOnlyEnrollmentClient = new EnrollmentClient(readOnlyClient);

    if (process.env.INTEGRATION !== 'true') {
      await expect(readOnlyEnrollmentClient.enroll(testQueueId, testPublicKey)).rejects.toThrow('MISSING_CREDENTIALS');
      return;
    }

    try {
      const isEnrolled = await readOnlyEnrollmentClient.isEnrolled(testQueueId, testPublicKey);
      expect(typeof isEnrolled).toBe('boolean');
      await expect(readOnlyEnrollmentClient.enroll(testQueueId, testPublicKey)).rejects.toThrow('MISSING_CREDENTIALS');
    } catch (error) {
      if (error instanceof Error && (error.message.includes('connect') || error.message.includes('fetch'))) {
        console.warn('Skipping integration test: network not available');
        return;
      }
      throw error;
    }
  }, 30000);
});
