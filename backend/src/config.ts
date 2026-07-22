/**
 * Centralised backend configuration derived from environment variables.
 *
 * Keeps `process.env` access in one place so services, adapters, and the HTTP
 * layer read a typed config object instead of scattering `process.env` lookups.
 */

/** Contract IDs the backend can read on-chain state from. */
export interface ContractIds {
  factory?: string | undefined;
  queue?: string | undefined;
  enrollment?: string | undefined;
  identity?: string | undefined;
  escrow?: string | undefined;
}

export interface BackendConfig {
  nodeEnv: string;
  port: number;
  databaseUrl?: string | undefined;
  sorobanRpcUrl: string;
  stellarNetwork: string;
  networkPassphrase?: string;
  operatorSecretKey?: string;
  contractIds: ContractIds;
  /** True when at least one contract ID is configured (enables the on-chain read path). */
  contractsConfigured: boolean;
}

/**
 * Read a contract ID, preferring the canonical name from issue #4
 * (e.g. `ENROLLMENT_CONTRACT_ID`) and falling back to the legacy
 * `LINEPROOF_`-prefixed name already present in `.env.example`.
 */
function readContractId(
  env: NodeJS.ProcessEnv,
  canonical: string,
  legacy: string,
): string | undefined {
  const value = (env[canonical] ?? env[legacy] ?? "").trim();
  return value.length > 0 ? value : undefined;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  const contractIds: ContractIds = {
    factory: readContractId(
      env,
      "QUEUE_FACTORY_CONTRACT_ID",
      "LINEPROOF_FACTORY_CONTRACT_ID",
    ),
    queue: readContractId(
      env,
      "QUEUE_CONTRACT_ID",
      "LINEPROOF_QUEUE_CONTRACT_ID",
    ),
    enrollment: readContractId(
      env,
      "ENROLLMENT_CONTRACT_ID",
      "LINEPROOF_ENROLLMENT_CONTRACT_ID",
    ),
    identity: readContractId(
      env,
      "IDENTITY_CONTRACT_ID",
      "LINEPROOF_IDENTITY_CONTRACT_ID",
    ),
    escrow: readContractId(
      env,
      "ESCROW_CONTRACT_ID",
      "LINEPROOF_ESCROW_CONTRACT_ID",
    ),
  };

  const contractsConfigured = Object.values(contractIds).some((id) =>
    Boolean(id),
  );

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: env.PORT ? Number(env.PORT) : 4000,
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    sorobanRpcUrl:
      env.SOROBAN_RPC_URL?.trim() ||
      (contractsConfigured ? "" : "https://soroban-testnet.stellar.org"),
    stellarNetwork: env.STELLAR_NETWORK?.trim() || "TESTNET",
    networkPassphrase: env.NETWORK_PASSPHRASE?.trim() || undefined,
    operatorSecretKey: env.OPERATOR_SECRET_KEY?.trim() || undefined,
    contractIds,
    contractsConfigured,
  };
}

/** Fail fast only when chain mode is requested; an empty environment is valid mock mode. */
export function validateStartupConfig(value: BackendConfig): void {
  if (!value.contractsConfigured) return;
  const missing: string[] = [];
  if (!value.contractIds.enrollment) missing.push("ENROLLMENT_CONTRACT_ID");
  if (!value.contractIds.escrow) missing.push("ESCROW_CONTRACT_ID");
  if (!value.contractIds.factory) missing.push("QUEUE_FACTORY_CONTRACT_ID");
  if (!value.sorobanRpcUrl) missing.push("SOROBAN_RPC_URL");
  if (!value.networkPassphrase) missing.push("NETWORK_PASSPHRASE");
  if (missing.length > 0) {
    throw new Error(
      `Incomplete Soroban configuration: missing ${missing.join(", ")}`,
    );
  }
}

/** Singleton config for the running process. */
export const config: BackendConfig = loadConfig();
