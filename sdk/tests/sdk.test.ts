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
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: vi.fn(() => ({
        getAccount: vi.fn(async () => ({ sequence: '1' })),
        prepareTransaction: vi.fn(async (tx) => { (tx as any).sign = vi.fn(); return tx; }),
        sendTransaction: vi.fn(async () => ({ status: 'SUCCESS', hash: 'mockhash' })),
        simulateTransaction: vi.fn(async () => ({
          result: { retval: actual.xdr.ScVal.scvBool(true) }
        })),
        getTransaction: vi.fn(async () => ({
          status: actual.SorobanRpc.Api.GetTransactionStatus.SUCCESS,
          returnValue: actual.xdr.ScVal.scvVec([actual.xdr.ScVal.scvU32(1)]),
        })),
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
  it('getPosition parses position from simulateTransaction', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const { xdr } = await import('@stellar/stellar-sdk');
    
    // Mock the response for getPosition
    client.sorobanServer.simulateTransaction = vi.fn().mockResolvedValue({
      result: {
        retval: xdr.ScVal.scvMap([
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('position_id'), val: xdr.ScVal.scvU32(5) }),
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('enrolled_at'), val: xdr.ScVal.scvU64(xdr.Uint64.fromString("1234567890")) }),
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('identity'), val: xdr.ScVal.scvString('G_TEST_IDENTITY') }),
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('status'), val: xdr.ScVal.scvSymbol('advanced') }),
        ])
      }
    } as any);

    const queue = new QueueClient(client, { queueContractId: 'CQUEUE123' });
    const pos = await queue.getPosition(5);
    expect(pos.positionId.toString()).toBe('5');
    expect(pos.status).toBe('advanced');
  });

  it('advance polls and parses return value', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET, privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });
    const { xdr } = await import('@stellar/stellar-sdk');
    
    client.sorobanServer.getTransaction = vi.fn().mockResolvedValue({
      status: 'SUCCESS',
      returnValue: xdr.ScVal.scvVec([xdr.ScVal.scvU32(42), xdr.ScVal.scvU32(43)])
    } as any);

    const queue = new QueueClient(client, { queueContractId: 'CQUEUE123' });
    const advanced = await queue.advance(2);
    expect(advanced).toEqual([42, 43]);
  });
});

describe('EnrollmentClient', () => {
  it('throws SDKError when credentials missing on enroll', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const enrollment = new EnrollmentClient(client);
    await expect(enrollment.enroll('queue-id', 'identity')).rejects.toThrow(SDKError);
  });

  it('isEnrolled parses boolean from simulateTransaction', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const enrollment = new EnrollmentClient(client);
    const { xdr } = await import('@stellar/stellar-sdk');
    
    client.sorobanServer.simulateTransaction = vi.fn().mockResolvedValue({
      result: { retval: xdr.ScVal.scvBool(true) }
    } as any);

    const result = await enrollment.isEnrolled('queue-id', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    expect(result).toBe(true);
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

  it('isBound parses boolean from simulateTransaction', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const identity = new IdentityClient(client);
    const { xdr } = await import('@stellar/stellar-sdk');
    
    client.sorobanServer.simulateTransaction = vi.fn().mockResolvedValue({
      result: { retval: xdr.ScVal.scvBool(false) }
    } as any);

    const result = await identity.isBound('queue-id', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
    expect(result).toBe(false);
  });
});

describe('Credentials and Keypair Validation', () => {
  it('throws SDKError("MISSING_CREDENTIALS") when no private key is configured across all transaction methods', async () => {
    const client = new LineProofClient({ rpcServerUrl: 'http://localhost:8000', networkPassphrase: TEST_NET });
    const enrollment = new EnrollmentClient(client);
    const escrow = new EscrowClient(client);
    const queue = new QueueClient(client, { queueContractId: 'queue-id' });
    const identity = new IdentityClient(client);

    await expect(enrollment.enroll('queue-id', 'identity')).rejects.toThrow(SDKError);
    await expect(enrollment.cancel('queue-id', 'identity')).rejects.toThrow(SDKError);
    await expect(queue.advance(1)).rejects.toThrow(SDKError);
    await expect(queue.close()).rejects.toThrow(SDKError);
    await expect(identity.bindIdentity('queue-id', 'identity')).rejects.toThrow(SDKError);
    await expect(escrow.deposit('escrow-id', 10, 'USDC')).rejects.toThrow(SDKError);
    await expect(escrow.release('escrow-id', 'identity')).rejects.toThrow(SDKError);
    await expect(escrow.refund('escrow-id', 'identity')).rejects.toThrow(SDKError);
    await expect(escrow.expire('escrow-id', 'identity')).rejects.toThrow(SDKError);
  });

  it('never calls Keypair.fromSecret with a G-prefixed string', async () => {
    const client = new LineProofClient({ 
      rpcServerUrl: 'http://localhost:8000', 
      networkPassphrase: TEST_NET, 
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' 
    });
    const enrollment = new EnrollmentClient(client);
    
    // Clear previous mock calls
    const { Keypair } = await import('@stellar/stellar-sdk');
    const mockFromSecret = Keypair.fromSecret as any;
    mockFromSecret.mockClear();

    client.sorobanServer = {
      getAccount: vi.fn().mockResolvedValue({ sequence: '1' }),
      prepareTransaction: vi.fn().mockResolvedValue({ sign: vi.fn() }),
      sendTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS', hash: 'mockhash' })
    } as any;

    await enrollment.enroll('queue-id', 'identity');
    
    for (const call of mockFromSecret.mock.calls) {
      expect(typeof call[0]).toBe('string');
      expect(call[0].startsWith('G')).toBe(false);
    }
  });
});
