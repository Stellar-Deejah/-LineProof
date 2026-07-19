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
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: vi.fn(async () => ({ sequence: 1, balances: [] })),
        submitTransaction: vi.fn(async () => ({ hash: 'mockhash' })),
      })),
    },
    Keypair: {
      ...actual.Keypair,
      fromSecret: vi.fn(() => ({
        publicKey: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        secret: () => 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        sign: vi.fn(),
      })),
      random: vi.fn(() => ({
        publicKey: () => 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
        secret: () => 'SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      })),
    },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
      STANDALONE: 'Standalone Network ; February 2017',
    },
    BASE_FEE: '100',
    SorobanRpc: {
      Server: vi.fn(() => ({
        simulateTransaction: vi.fn(async () => ({
          result: 'AAAAAQ==', // base64 encoded XDR for a boolean true
        })),
      })),
    },
  };
});

const TEST_NET = NetworkPassphrase.TESTNET;

describe('LineProofClient', () => {
  it('throws when privateKey is missing for deployFactory', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    await expect(client.deployFactory()).rejects.toThrow(SDKError);
  });
});

describe('QueueClient', () => {
  it('getPosition rejects a non-positive positionId', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const queue = new QueueClient(client, { queueContractId: 'CQUEUE123' });
    await expect(queue.getPosition(0)).rejects.toThrow('INVALID_INPUT');
  });
});

describe('EnrollmentClient', () => {
  it('throws SDKError when credentials missing on enroll', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const enrollment = new EnrollmentClient(client);
    await expect(enrollment.enroll('queue-id', 'identity')).rejects.toThrow(SDKError);
  });
});

describe('EscrowClient', () => {
  it('rejects non-positive deposit amount', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const escrow = new EscrowClient(client);
    await expect(escrow.deposit('escrow-id', 0, 'USDC')).rejects.toThrow('deposit amount must be positive');
  });
});

describe('IdentityClient', () => {
  it('throws TRANSFER_DISABLED on transfer attempt', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const identity = new IdentityClient(client);
    await expect(identity.recordTransferAttempt('from', 'to', 'queue')).rejects.toThrow('TRANSFER_DISABLED');
  });
});
