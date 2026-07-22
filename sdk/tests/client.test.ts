import { describe, it, expect, vi } from 'vitest';
import { LineProofClient } from '../src/client';
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
        secret: () => 'SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
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
        getAccount: vi.fn(async () => ({ sequence: '1' })),
        prepareTransaction: vi.fn(async (tx) => { (tx as any).sign = vi.fn(); return tx; }),
        sendTransaction: vi.fn(async () => ({ status: 'SUCCESS', hash: 'mockhash' })),
        simulateTransaction: vi.fn(async () => ({
          result: { retval: actual.xdr.ScVal.scvBool(true) }
        })),
        getTransaction: vi.fn(async () => ({
          status: actual.SorobanRpc.Api.GetTransactionStatus.SUCCESS,
          returnValue: actual.xdr.ScVal.scvAddress(
            actual.Address.contract(Buffer.from('01234567890123456789012345678901')).toScAddress()
          ),
        })),
      })),
    },
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

describe('LineProofClient.uploadWasm & installContract & deployFactory', () => {
  it('throws MISSING_CREDENTIALS when no privateKey is set for deployFactory', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
    });
    await expect(client.deployFactory()).rejects.toMatchObject({ code: 'MISSING_CREDENTIALS' });
  });

  it('uploadWasm builds and submits WASM bytecode', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const wasmHash = await client.uploadWasm(wasmBytes);
    expect(typeof wasmHash).toBe('string');
    expect(wasmHash.length).toBe(64);
  });

  it('installContract instantiates contract from WASM hash and returns C... contract ID', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const mockHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const contractId = await client.installContract(mockHash);
    expect(typeof contractId).toBe('string');
    expect(contractId.startsWith('C')).toBe(true);
    expect(contractId.length).toBe(56);
  });

  it('deployFactory performs two-step upload and install returning valid contract ID', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const contractId = await client.deployFactory();
    expect(typeof contractId).toBe('string');
    expect(contractId.startsWith('C')).toBe(true);
    expect(contractId.length).toBe(56);
    expect(client.resolveFactory()).toBe(contractId);
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
