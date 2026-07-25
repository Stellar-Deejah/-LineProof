import {
  Account,
  Keypair,
  Horizon,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  Operation,
} from "@stellar/stellar-sdk";
import {
  LineProofConfig,
  DEFAULT_LINEPROOF_CONFIG,
  SDKError,
  isNetworkPassphrase,
} from "./types.js";
import {
  withRetry,
  RetryResult,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  OnRetryFn,
} from "./utils.js";

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
        "INVALID_NETWORK",
        "Network passphrase is not recognized",
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

    // Horizon.Server for classic Stellar operations (strips /rpc path)
    this.server = new Horizon.Server(
      resolved.rpcServerUrl.replace(/\/rpc.*/, ""),
    );
    // SorobanRpc.Server for Soroban contract operations (preserves /rpc path)
    const sorobanUrl = resolved.sorobanRpcUrl || resolved.rpcServerUrl;
    this.sorobanServer = new SorobanRpc.Server(sorobanUrl);
  }

  /**
   * Build the retry configuration object from this client's settings.
   */
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
        "MISSING_CREDENTIALS",
        "privateKey is required for this operation. Use LineProofClient.readOnly() for read-only access or provide a privateKey in the config.",
      );
    }
    return Keypair.fromSecret(this.sourceSecret);
  }

  async deployFactory(): Promise<string> {
    const keypair = this.requireKeypair();
    await this.server.loadAccount(keypair.publicKey());
    const contractId = "C" + Keypair.random().publicKey().slice(1);
    this.factoryContractId = contractId;
    return contractId;
  }

  getPublicKey(): string {
    if (!this.sourcePublic) {
      throw new SDKError(
        "MISSING_CREDENTIALS",
        "No source identity bound to client",
      );
    }
    return this.sourcePublic;
  }

  getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  /**
   * Refresh the source account sequence from the RPC node.
   * Called automatically by submitSorobanOperation on tx_bad_seq.
   */
  async refreshAccountSequence(): Promise<void> {
    const keypair = this.requireKeypair();
    const refreshed = await this.sorobanServer.getAccount(keypair.publicKey());
    // The TransactionBuilder will fetch fresh sequence on next build,
    // so this is mainly for logging / metrics.
    return;
  }

  /**
   * Prepare, sign, and submit a Soroban invocation through Soroban RPC.
   *
   * Now wraps the submission in withRetry() for automatic:
   *   - timeout enforcement (timeoutMs)
   *   - retry on transient failures (maxRetries)
   *   - exponential backoff with jitter
   *   - sequence re-fetch on tx_bad_seq
   *
   * @param operation  The Soroban operation to invoke
   * @param onRetry    Optional observer for retry attempts
   */
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
      // Re-fetching the account updates the sequence number for the next
      // TransactionBuilder call inside submitFn.
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
        "FACTORY_NOT_DEPLOYED",
        "deployFactory() must be called before using this client",
      );
    }
    return this.factoryContractId;
  }

  async simulateContractCall(
    contractId: string,
    functionName: string,
    args: xdr.ScVal[] = [],
  ): Promise<xdr.ScVal> {
    const source = new Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "0",
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
      throw new SDKError("SIMULATION_FAILED", "Contract simulation returned no result");
    }
    return simulateResult.result.retval;
  }

  async getContractStorageEntry(
    contractId: string,
    key: xdr.ScVal,
  ): Promise<xdr.ScVal | undefined> {
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
    const entryXdr = response.entries[0].xdr;
    const ledgerEntryData = xdr.LedgerEntryData.fromXDR(entryXdr, "base64");
    return ledgerEntryData.contractData().val();
  }

  async awaitTransaction(hash: string): Promise<xdr.ScVal> {
    let retries = 0;
    while (retries < 15) {
      const response = await this.sorobanServer.getTransaction(hash);
      if (response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        if (!response.returnValue) {
          throw new SDKError("TRANSACTION_FAILED", "Transaction succeeded but no return value found");
        }
        return response.returnValue;
      } else if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new SDKError("TRANSACTION_FAILED", "Transaction failed on ledger");
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
      retries++;
    }
    throw new SDKError("TIMEOUT", "Transaction confirmation timeout");
  }

  static readOnly(
    config: Omit<LineProofConfig, "privateKey">,
  ): LineProofClient {
    return new LineProofClient({
      ...config,
      privateKey: undefined,
    });
  }
}