import { describe, it, expect, vi } from 'vitest';
import { LineProofClient } from '../src/client';
import { QueueClient } from '../src/queue';
import { EnrollmentClient } from '../src/enrollment';
import { EscrowClient } from '../src/escrow';
import { IdentityClient } from '../src/identity';
import { SDKError, NetworkPassphrase } from '../src/types';

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    Keypair: {
      ...actual.Keypair,
      fromSecret: vi.fn(() => ({
        publicKey: () => 'GABC123456789012345678901234567890123456789012345678901234',
        secret: () => 'SABC',
        sign: vi.fn(),
      })),
      random: vi.fn(() => ({
        publicKey: () => 'GRANDOM9999999999999999999999999999999999999999999999999999',
        secret: () => 'SRANDOM',
      })),
    },
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: vi.fn(async () => ({ sequence: 1, balances: [] })),
        submitTransaction: vi.fn(async () => ({ hash: 'mockhash' })),
      })),
    },
    BASE_FEE: '100',
    Networks: {
      TESTNET: NetworkPassphrase.TESTNET,
      PUBLIC: NetworkPassphrase.MAINNET,
      STANDALONE: NetworkPassphrase.STANDALONE,
    },
  };
});

describe('LineProofClient', () => {
  it('throws when privateKey is missing for deployFactory', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000/soroban/rpc',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    await expect(client.deployFactory()).rejects.toThrow(SDKError);
  });
});

describe('QueueClient', () => {
  const mockClient = new LineProofClient({
    rpcServerUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: NetworkPassphrase.TESTNET,
  });
  const queue = new QueueClient(mockClient, { queueContractId: 'CQUEUE123' });

  it('getPosition placeholder throws NOT_IMPLEMENTED', async () => {
    await expect(queue.getPosition(1)).rejects.toThrow('NOT_IMPLEMENTED');
  });
});

describe('EnrollmentClient', () => {
  const mockClient = new LineProofClient({
    rpcServerUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: NetworkPassphrase.TESTNET,
  });
  const enrollment = new EnrollmentClient(mockClient);

  it('rejects missing credentials on enroll', async () => {
    await expect(enrollment.enroll('queue-id', 'identity')).rejects.toThrow(SDKError);
  });
});

describe('EscrowClient', () => {
  const mockClient = new LineProofClient({
    rpcServerUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: NetworkPassphrase.TESTNET,
  });
  const escrow = new EscrowClient(mockClient);

  it('rejects non-positive deposit amount', async () => {
    await expect(escrow.deposit('escrow-id', 0, 'USDC')).rejects.toThrow('deposit amount must be positive');
  });
});

describe('IdentityClient', () => {
  const mockClient = new LineProofClient({
    rpcServerUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: NetworkPassphrase.TESTNET,
  });
  const identity = new IdentityClient(mockClient);

  it('throws TRANSFER_DISABLED on transfer attempt', async () => {
    await expect(identity.recordTransferAttempt('from', 'to', 'queue')).rejects.toThrow('TRANSFER_DISABLED');
  });
});
