import { describe, it, expect, vi } from 'vitest';
import { Account, Address, Operation, xdr } from '@stellar/stellar-sdk';
import { LineProofClient } from '../src/client';
import { SDKError, NetworkPassphrase } from '../src/types';

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    Horizon: {
      Server: vi.fn(() => ({
        loadAccount: vi.fn(async () => ({ 
          sequence: 1, 
          balances: [],
          accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        })),
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
      ...actual.SorobanRpc,
      Server: vi.fn(() => ({
        getAccount: vi.fn(async () => new actual.Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '1')),
        prepareTransaction: vi.fn(async (tx) => { (tx as any).sign = vi.fn(); return tx; }),
        sendTransaction: vi.fn(async () => ({ status: 'SUCCESS', hash: 'mockhash' })),
        simulateTransaction: vi.fn(async () => ({
          transactionData: '',
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
    const expectedContractId = Address.contract(
      Buffer.from('01234567890123456789012345678901'),
    ).toString();
    client.sorobanServer.getTransaction = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: xdr.ScVal.scvBytes(Buffer.alloc(32)),
      })
      .mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: new Address(expectedContractId).toScVal(),
      });
    const contractId = await client.deployFactory(
      new Uint8Array([0x00, 0x61, 0x73, 0x6d]),
    );
    expect(contractId).toBe(expectedContractId);
    expect(client.sorobanServer.sendTransaction).toHaveBeenCalledTimes(2);
    expect(client.sorobanServer.getTransaction).toHaveBeenCalledTimes(2);
    expect(client.resolveFactory()).toBe(contractId);
  });

  it('rejects deployment without factory WASM bytes', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    await expect(client.deployFactory()).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('LineProofClient sequence cache', () => {
  const operation = Operation.uploadContractWasm({ wasm: Buffer.from([0x00, 0x61, 0x73, 0x6d]) });

  it('reserves successive sequences after one account fetch', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const preparedSequences: string[] = [];
    client.sorobanServer.prepareTransaction = vi.fn(async (transaction) => {
      preparedSequences.push(transaction.sequence);
      (transaction as any).sign = vi.fn();
      return transaction;
    });

    await Promise.all([
      client.submitSorobanOperation(operation),
      client.submitSorobanOperation(operation),
    ]);

    expect(client.sorobanServer.getAccount).toHaveBeenCalledTimes(1);
    expect(preparedSequences).toEqual(['2', '3']);
  });

  it('refreshes the cached sequence after tx_bad_seq', async () => {
    const client = new LineProofClient({
      rpcServerUrl: 'http://localhost:8000',
      networkPassphrase: NetworkPassphrase.TESTNET,
      privateKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      baseDelayMs: 0,
      maxDelayMs: 0,
      jitterFactor: 0,
    });
    client.sorobanServer.getAccount = vi
      .fn()
      .mockResolvedValueOnce(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '7'))
      .mockResolvedValueOnce(new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '20'));
    const preparedSequences: string[] = [];
    client.sorobanServer.prepareTransaction = vi.fn(async (transaction) => {
      preparedSequences.push(transaction.sequence);
      (transaction as any).sign = vi.fn();
      return transaction;
    });
    client.sorobanServer.sendTransaction = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'ERROR',
        hash: 'rejected',
        errorResult: new xdr.TransactionResult({
          feeCharged: xdr.Int64.fromString('100'),
          result: xdr.TransactionResultResult.txBadSeq(),
          ext: new xdr.TransactionResultExt(0),
        }),
      })
      .mockResolvedValueOnce({ status: 'PENDING', hash: 'accepted' });

    await expect(client.submitSorobanOperation(operation)).resolves.toBe('accepted');
    expect(client.sorobanServer.getAccount).toHaveBeenCalledTimes(2);
    expect(preparedSequences).toEqual(['8', '21']);
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
