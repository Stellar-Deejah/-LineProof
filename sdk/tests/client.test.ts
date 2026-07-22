import { describe, it, expect, vi } from 'vitest';
import { LineProofClient } from '../src/client';
import { SDKError, NetworkPassphrase } from '../src/types';

// vi.mock is hoisted — no top-level variables allowed inside the factory.
// Use inline values only.
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
    // Object spread drops a class's non-enumerable statics (e.g. fromSecret);
    // inherit them through the prototype chain instead.
    Keypair: Object.assign(Object.create(actual.Keypair), {
      random: vi.fn(() => ({
        publicKey: () => 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
        secret: () => 'SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      })),
    }),
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
    xdr: {
      ScVal: {
        fromXDR: vi.fn(() => ({
          switch: () => ({ name: 'Bool' }),
          b: () => true,
        })),
        scvString: vi.fn((val: string) => ({ _value: val })),
        scvU64: vi.fn((val: number) => ({ _value: val })),
      },
    },
    SorobanDataBuilder: vi.fn(() => ({
      build: vi.fn(() => ({ _unused: true })),
    })),
  };
});

describe('LineProofClient constructor', () => {
  it('throws SDKError for unrecognised network passphrase', () => {
    expect(() =>
      new LineProofClient({
        rpcServerUrl: 'http://localhost:8000',
        networkPassphrase: 'Unknown Network ; Never',
      }),
    ).toThrow(SDKError);
  });

  it('creates client with valid TESTNET passphrase', () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    expect(client.getNetworkPassphrase()).toBe(NetworkPassphrase.TESTNET);
  });
});

describe('LineProofClient.deployFactory', () => {
  it('throws MISSING_CREDENTIALS when no privateKey is set', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    await expect(client.deployFactory()).rejects.toMatchObject({ code: 'MISSING_CREDENTIALS' });
  });

  it('returns a string when privateKey is provided', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const id = await client.deployFactory();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('LineProofClient.resolveFactory', () => {
  it('throws FACTORY_NOT_DEPLOYED before deployFactory is called', () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    expect(() => client.resolveFactory()).toThrow(SDKError);
  });
});

describe('LineProofClient.requireKeypair', () => {
  it('throws MISSING_CREDENTIALS when privateKey is not set', () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    expect(() => client.requireKeypair()).toThrow(SDKError);
    expect(() => client.requireKeypair()).toThrow('MISSING_CREDENTIALS');
  });

  it('returns Keypair when privateKey is set', () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const keypair = client.requireKeypair();
    expect(keypair).toBeDefined();
    expect(keypair.publicKey()).toBe('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF');
  });
});

describe('LineProofClient.readOnly', () => {
  it('creates a read-only client without privateKey', () => {
    const client = LineProofClient.readOnly({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });
    expect(client.getNetworkPassphrase()).toBe(NetworkPassphrase.TESTNET);
    expect(() => client.requireKeypair()).toThrow('MISSING_CREDENTIALS');
  });
});
