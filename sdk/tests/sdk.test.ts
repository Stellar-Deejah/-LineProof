import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LineProofClient } from '../src/client';
import { QueueClient } from '../src/queue';
import { EnrollmentClient } from '../src/enrollment';
import { EscrowClient } from '../src/escrow';
import { IdentityClient } from '../src/identity';
import { SDKError } from '../src/types';

vi.mock('@stellar/stellar-sdk', () => {
  const original = await vi.importActual('@stellar/stellar-sdk');
  return {
    ...original,
    Keypair: {
      fromSecret: vi.fn(() => ({
        publicKey: () => 'GABC123',
        secret: () => 'secret-key',
      })),
      random: vi.fn(() => ({
        publicKey: () => 'GRANDOM999',
      })),
    },
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: vi.fn(async () => ({
          sequence: 1,
          balances: [],
        })),
        submitTransaction: vi.fn(async () => ({ hash: 'hash' })),
      })),
    },
    BASE_FEE: '100',
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      STANDALONE: 'Standalone Network ; February 2017',
    },
  };
});

describe('LineProofClient', () => {
  it('throws when privateKey is missing for deployFactory', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000/soroban/rpc' });
    expect(() => client.deployFactory()).toThrow(SDKError);
  });
});

describe('QueueClient', () => {
  const mockClient = new LineProofClient({ rpcServerUrl: 'http://localhost:8000/soroban/rpc' } as any);
  const queue = new QueueClient(mockClient, { queueContractId: 'CQUEUE123' });

  it('exposes a getPosition placeholder that throws NOT_IMPLEMENTED', async () => {
    await expect(queue.getPosition(1)).rejects.toThrow('NOT_IMPLEMENTED');
  });
});

describe('EnrollmentClient', () => {
  const mockClient = new LineProofClient({ rpcServerUrl: 'http://localhost:8000/soroban/rpc' } as any);
  const enrollment = new EnrollmentClient(mockClient);

  it('rejects missing credentials on enroll', async () => {
    await expect(enrollment.enroll('queue-id', 'identity')).rejects.toThrow('MISSING_CREDENTIALS');
  });
});

describe('EscrowClient', () => {
  const mockClient = new LineProofClient({ rpcServerUrl: 'http://localhost:8000/soroban/rpc' } as any);
  const escrow = new EscrowClient(mockClient);

  it('rejects non-positive deposit amount', async () => {
    await expect(escrow.deposit('escrow-id', 0, 'USDC')).rejects.toThrow('deposit amount must be positive');
  });
});

describe('IdentityClient', () => {
  const mockClient = new LineProofClient({ rpcServerUrl: 'http://localhost:8000/soroban/rpc' } as any);
  const identity = new IdentityClient(mockClient);

  it('throws TRANSFER_DISABLED on transfer attempt', async () => {
    await expect(identity.recordTransferAttempt('from', 'to', 'queue')).rejects.toThrow('TRANSFER_DISABLED');
  });
});
