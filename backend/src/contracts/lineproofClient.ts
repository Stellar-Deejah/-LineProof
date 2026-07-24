import {
  EnrollmentClient,
  EscrowClient,
  LineProofClient,
  QueueClient,
} from "@lineproof/sdk";
import { config, type BackendConfig } from "../config.js";

export class ContractWriteUnavailableError extends Error {
  readonly status = 503;

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ContractWriteUnavailableError";
  }
}

export interface LineProofClientSingleton {
  readonly client: LineProofClient;
  readonly enrollment: EnrollmentClient;
  readonly escrow: EscrowClient;
  readonly contractIds: Required<
    Pick<BackendConfig["contractIds"], "factory" | "enrollment" | "escrow">
  >;
  readonly canWrite: boolean;
  queue(contractId: string): QueueClient;
}

export function createLineProofClient(
  value: BackendConfig,
): LineProofClientSingleton | undefined {
  if (!value.contractsConfigured) return undefined;
  const { factory, enrollment, escrow } = value.contractIds;
  if (!factory || !enrollment || !escrow || !value.networkPassphrase)
    return undefined;
  const client = new LineProofClient({
    rpcServerUrl: value.sorobanRpcUrl,
    networkPassphrase: value.networkPassphrase,
    ...(value.operatorSecretKey ? { privateKey: value.operatorSecretKey } : {}),
  });
  return {
    client,
    enrollment: new EnrollmentClient(client),
    escrow: new EscrowClient(client),
    contractIds: { factory, enrollment, escrow },
    canWrite: Boolean(value.operatorSecretKey),
    queue: (contractId: string) =>
      new QueueClient(client, { queueContractId: contractId }),
  };
}

/** Typed, process-wide SDK client. Undefined means local mock mode. */
export const lineproofClient = createLineProofClient(config);

function requireWriter(): LineProofClientSingleton {
  if (!lineproofClient)
    throw new ContractWriteUnavailableError(
      "Soroban contracts are not configured",
    );
  if (!lineproofClient.canWrite) {
    throw new ContractWriteUnavailableError(
      "OPERATOR_SECRET_KEY is required for on-chain write operations",
    );
  }
  return lineproofClient;
}

async function submit<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ContractWriteUnavailableError) throw error;
    throw new ContractWriteUnavailableError(
      "Soroban transaction submission failed",
      error,
    );
  }
}

export const submitEnrollment = (
  queueId: string,
  identity: string,
): Promise<string> => {
  const sdk = requireWriter();
  return submit(() =>
    sdk.enrollment.enroll(sdk.contractIds.enrollment!, `${queueId}:${identity}`),
  );
};

export const submitEscrowDeposit = (
  amount: number,
  asset: string,
): Promise<string> => {
  const sdk = requireWriter();
  return submit(() =>
    sdk.escrow.deposit(sdk.contractIds.escrow!, amount, asset),
  );
};

export const submitQueueAdvance = (
  queueContractId: string,
  batchSize: number,
): Promise<number[]> => {
  const sdk = requireWriter();
  return submit(() => sdk.queue(queueContractId).advance(batchSize));
};

export const submitQueueClose = (queueContractId: string): Promise<string> => {
  const sdk = requireWriter();
  return submit(() => sdk.queue(queueContractId).close());
};

export async function readEnrollmentOnChain(
  identity: string,
): Promise<boolean | undefined> {
  if (!lineproofClient) return undefined;
  try {
    return await lineproofClient.enrollment.isEnrolled(
      lineproofClient.contractIds.enrollment!,
      identity,
    );
  } catch {
    return undefined;
  }
}
