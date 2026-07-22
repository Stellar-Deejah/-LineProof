import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { loadConfig, validateStartupConfig } from "../config.js";
import { createLineProofClient } from "../contracts/lineproofClient.js";

const contractId = `C${"A".repeat(55)}`;

describe("backend Soroban client configuration", () => {
  it("keeps an empty environment in mock mode", () => {
    const value = loadConfig({ NODE_ENV: "test" });
    expect(() => validateStartupConfig(value)).not.toThrow();
    expect(createLineProofClient(value)).toBeUndefined();
  });

  it("fails fast when configured mode is incomplete", () => {
    const value = loadConfig({ ENROLLMENT_CONTRACT_ID: contractId });
    expect(() => validateStartupConfig(value)).toThrow(/ESCROW_CONTRACT_ID/);
    expect(() => validateStartupConfig(value)).toThrow(
      /QUEUE_FACTORY_CONTRACT_ID/,
    );
    expect(() => validateStartupConfig(value)).toThrow(/SOROBAN_RPC_URL/);
    expect(() => validateStartupConfig(value)).toThrow(/NETWORK_PASSPHRASE/);
  });

  it("creates a typed read-only client when the operator key is absent", () => {
    const value = loadConfig({
      ENROLLMENT_CONTRACT_ID: contractId,
      ESCROW_CONTRACT_ID: contractId,
      QUEUE_FACTORY_CONTRACT_ID: contractId,
      SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
      NETWORK_PASSPHRASE: Networks.TESTNET,
    });
    validateStartupConfig(value);
    const sdk = createLineProofClient(value);
    expect(sdk).toBeDefined();
    expect(sdk?.canWrite).toBe(false);
  });
});
