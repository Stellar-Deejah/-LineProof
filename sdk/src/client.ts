import {
  Keypair,
  Horizon,
  SorobanRpc,
  TransactionBuilder,
  Account,
  BASE_FEE,
  xdr,
  Address,
  Operation,
  StrKey,
} from '@stellar/stellar-sdk';
import { createHash } from 'crypto';
import {
  LineProofConfig,
  DEFAULT_LINEPROOF_CONFIG,
  SDKError,
  isNetworkPassphrase,
  resolveEndpoints,
  validateContractId,
} from './types.js';
import {
  withRetry,
  RetryResult,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  OnRetryFn,
} from "./utils.js";
import { paginate, decodeCursor, type Page } from './pagination.js';
import { deserializeContractEvent, type RawContractEventLike, type EventFilter, type AnyLineProofEvent } from './events.js';

// Neutral all-zeros account used as the source for simulation-only (read)
// transactions, where no signature and no real sequence number are needed.
const SIMULATION_ACCOUNT_ID = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export class LineProofClient {
  readonly server: Horizon.Server;
  readonly sorobanServer: SorobanRpc.Server;
  readonly networkPassphrase: string;
  private readonly sourceSecret: string | undefined;
  private readonly sourcePublic: string | undefined;

  // Retry / timeout configuration (Issue #37)
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterFactor: number;

  private factoryContractId?: string;

  constructor(config: LineProofConfig) {
    const resolved = { ...DEFAULT_LINEPROOF_CONFIG, ...config };
    if (!isNetworkPassphrase(resolved.networkPassphrase)) {
      throw new SDKError(
        'INVALID_NETWORK',
        'Network passphrase is not recognized',
      );
    }
    this.networkPassphrase = resolved.networkPassphrase;
    this.sourceSecret = resolved.privateKey;

    // Retry / timeout config — now actually used (Issue #37)
    this.timeoutMs = resolved.timeoutMs ?? DEFAULT_LINEPROOF_CONFIG.timeoutMs;
    this.maxRetries = resolved.maxRetries ?? DEFAULT_LINEPROOF_CONFIG.maxRetries;
    this.baseDelayMs = resolved.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs;
    this.maxDelayMs = resolved.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs;
    this.jitterFactor = resolved.jitterFactor ?? DEFAULT_RETRY_CONFIG.jitterFactor;

    if (resolved.privateKey) {
      this.sourcePublic =
        resolved.publicKey?.trim() ||
        Keypair.fromSecret(resolved.privateKey).publicKey();
    } else {
      this.sourcePublic = resolved.publicKey?.trim();
    }

    const { horizonUrl, sorobanRpcUrl } = resolveEndpoints(config, DEFAULT_LINEPROOF_CONFIG);
    this.server = new Horizon.Server(horizonUrl.replace(/\/rpc.*/, ''));
    this.sorobanServer = new SorobanRpc.Server(sorobanRpcUrl);
  }

  get retryConfig(): RetryConfig {
    return {
      maxRetries: this.maxRetries,
      timeoutMs: this.timeoutMs,
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: this.maxDelayMs,
      jitterFactor: this.jitterFactor,
    };
  }

  simulationSource(): Account {
    return new Account(this.sourcePublic ?? SIMULATION_ACCOUNT_ID, '0');
  }

  requireKeypair(): Keypair {
    if (!this.sourceSecret) {
      throw new SDKError(
        'MISSING_CREDENTIALS',
        'privateKey is required for this operation. Use LineProofClient.readOnly() for read-only access or provide a privateKey in the config.',
      );
    }
    return Keypair.fromSecret(this.sourceSecret);
  }

  async uploadWasm(wasmBytes: Uint8Array): Promise<string> {
    if (!wasmBytes || wasmBytes.length === 0) {
      throw new SDKError('INVALID_INPUT', 'wasmBytes must be a non-empty Uint8Array');
    }
    this.requireKeypair();
    const wasmBuffer = Buffer.from(wasmBytes);
    const wasmHash = createHash('sha256').update(wasmBuffer).digest('hex');

    const op = Operation.uploadContractWasm({
      wasm: wasmBuffer,
    });

    await this.submitSorobanOperation(op);
    return wasmHash;
  }

  async installContract(wasmHash: string, _args: xdr.ScVal[] = []): Promise<string> {
    if (!wasmHash || typeof wasmHash !== 'string') {
      throw new SDKError('INVALID_INPUT', 'wasmHash must be a valid hex string');
    }
    const keypair = this.requireKeypair();
    const address = new Address(keypair.publicKey());
    const hashBuffer = Buffer.from(wasmHash, 'hex');

    const op = Operation.createCustomContract({
      address,
      wasmHash: hashBuffer,
    });

    const txHash = await this.submitSorobanOperation(op);
    let contractId: string;
    try {
      const returnVal = await this.awaitTransaction(txHash);
      if (returnVal) {
        contractId = Address.fromScVal(returnVal).toString();
      } else {
        throw new Error('No return value');
      }
    } catch {
      const scAddr = xdr.ScAddress.scAddressTypeContract(hashBuffer.slice(0, 32));
      contractId = Address.fromScAddress(scAddr).toString();
    }

    validateContractId(contractId);
    this.factoryContractId = contractId;
    return contractId;
  }

  async deployFactory(wasmBytes?: Uint8Array): Promise<string> {
    this.requireKeypair();
    await this.server.loadAccount(this.requireKeypair().publicKey());

    const bytesToDeploy = wasmBytes ?? new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const wasmHash = await this.uploadWasm(bytesToDeploy);
    const contractId = await this.installContract(wasmHash);
    validateContractId(contractId);
    this.factoryContractId = contractId;
    return contractId;
  }

  getPublicKey(): string {
    if (!this.sourcePublic) {
      throw new SDKError(
        'MISSING_CREDENTIALS',
        'No source identity bound to client',
      );
    }
    return this.sourcePublic;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  async refreshAccountSequence(): Promise<void> {
    this.requireKeypair();
    await this.sorobanServer.getAccount(this.requireKeypair().publicKey());
  }

  async submitSorobanOperation(
    operation: Parameters<TransactionBuilder["addOperation"]>[0],
    onRetry?: OnRetryFn,
  ): Promise<string> {
    const keypair = this.requireKeypair();

    const submitFn = async (signal: AbortSignal): Promise<string> => {
      const source = await this.sorobanServer.getAccount(keypair.publicKey());
      const transaction = new TransactionBuilder(source, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      const prepared = await this.sorobanServer.prepareTransaction(transaction);
      prepared.sign(keypair);

      if (signal.aborted) {
        throw new Error('Transaction submission aborted before send');
      }

      const result = await this.sorobanServer.sendTransaction(prepared);
      if (result.status === "ERROR") {
        throw new SDKError(
          "TRANSACTION_FAILED",
          "Soroban RPC rejected the transaction",
        );
      }
      return result.hash;
    };

    const sequenceRefetch = async () => {
      await this.sorobanServer.getAccount(keypair.publicKey());
    };

    const retryResult = await withRetry(
      submitFn,
      this.retryConfig,
      sequenceRefetch,
      onRetry,
    );

    return retryResult.result;
  }

  resolveFactory(): string {
    if (!this.factoryContractId) {
      throw new SDKError(
        'FACTORY_NOT_DEPLOYED',
        'deployFactory() must be called before using this client',
      );
    }
    validateContractId(this.factoryContractId);
    return this.factoryContractId;
  }

  async simulateContractCall(
    contractId: string,
    functionName: string,
    args: xdr.ScVal[] = [],
  ): Promise<xdr.ScVal> {
    validateContractId(contractId);
    const source = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0',
    );
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: functionName,
          args,
        }),
      )
      .setTimeout(30)
      .build();

    const simulateResult = await this.sorobanServer.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(simulateResult) || !simulateResult.result) {
      throw new SDKError('SIMULATION_FAILED', 'Contract simulation returned no result');
    }
    return simulateResult.result.retval;
  }

  async getContractStorageEntry(
    contractId: string,
    key: xdr.ScVal,
  ): Promise<xdr.ScVal | undefined> {
    validateContractId(contractId);
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: key,
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );
    const response = await this.sorobanServer.getLedgerEntries(ledgerKey);
    if (!response.entries || response.entries.length === 0) {
      return undefined;
    }
    const entryXdr = (response.entries[0] as any).xdr;
    const ledgerEntryData = xdr.LedgerEntryData.fromXDR(entryXdr, "base64");
    return ledgerEntryData.contractData().val();
  }

  async awaitTransaction(hash: string): Promise<xdr.ScVal> {
    let retries = 0;
    while (retries < 15) {
      const response = await this.sorobanServer.getTransaction(hash);
      if (response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        if (!response.returnValue) {
          throw new SDKError('TRANSACTION_FAILED', 'Transaction succeeded but no return value found');
        }
        return response.returnValue;
      } else if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new SDKError('TRANSACTION_FAILED', 'Transaction failed on ledger');
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      retries++;
    }
    throw new SDKError('TIMEOUT', 'Transaction confirmation timeout');
  }

  async getEvents(filter: EventFilter = {}): Promise<Page<AnyLineProofEvent>> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const startLedger = filter.cursor ? decodeCursor(filter.cursor).ledger : filter.startLedger ?? 0;

    const response = await this.sorobanServer.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          ...(filter.contractIds ? { contractIds: filter.contractIds } : {}),
        },
      ],
      limit,
    });

    const events = response.events
      .map((raw) => deserializeContractEvent(raw as unknown as RawContractEventLike))
      .filter((event): event is AnyLineProofEvent => event !== undefined)
      .filter((event) => !filter.namespaces || filter.namespaces.includes(event.namespace));

    const pageOptions: Parameters<typeof paginate>[1] = filter.cursor ? { limit, cursor: filter.cursor } : { limit };
    return paginate(events, pageOptions, (event, index) => ({
      ledger: event.ledger,
      index,
    }));
  }

  streamEvents(
    filter: EventFilter,
    callback: (event: AnyLineProofEvent) => void,
    intervalMs = 5000,
  ): () => void {
    let cursor = filter.cursor;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (stopped) return;
      try {
        const page = await this.getEvents(cursor ? { ...filter, cursor } : filter);
        for (const event of page.items) callback(event);
        if (page.nextCursor) cursor = page.nextCursor;
      } catch {
        // Swallow transient RPC errors so a single failed poll doesn't stop
        // the stream; the next tick retries with the same cursor.
      }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    };

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  static readOnly(
    config: Omit<LineProofConfig, 'privateKey'>,
  ): LineProofClient {
    return new LineProofClient(config as LineProofConfig);
  }
}
