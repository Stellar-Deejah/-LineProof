import { describe, it, expect } from 'vitest';
import { SorobanContractAdapter } from '../contracts/sorobanContractAdapter.js';
import { ContractReadUnavailableError } from '../contracts/adapter.js';
import { loadConfig } from '../config.js';

const baseEnv = {
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  STELLAR_NETWORK: 'TESTNET',
} as NodeJS.ProcessEnv;

describe('SorobanContractAdapter', () => {
  it('reports configured when a contract ID is present', () => {
    const config = loadConfig({ ...baseEnv, QUEUE_CONTRACT_ID: 'C'.padEnd(56, 'A') });
    const adapter = new SorobanContractAdapter(config);
    expect(adapter.isConfigured()).toBe(true);
  });

  it('reports not configured when no contract IDs are set', () => {
    const config = loadConfig({ ...baseEnv });
    const adapter = new SorobanContractAdapter(config);
    expect(adapter.isConfigured()).toBe(false);
  });

  it('surfaces ContractReadUnavailableError while the SDK read path is pending', async () => {
    const config = loadConfig({ ...baseEnv, QUEUE_CONTRACT_ID: 'C'.padEnd(56, 'A') });
    const adapter = new SorobanContractAdapter(config);
    await expect(adapter.getQueue('sneaker-drop-001')).rejects.toBeInstanceOf(ContractReadUnavailableError);
  });

  it('accepts the legacy LINEPROOF_-prefixed contract ID alias', () => {
    const config = loadConfig({ ...baseEnv, LINEPROOF_ENROLLMENT_CONTRACT_ID: 'C'.padEnd(56, 'A') });
    expect(config.contractIds.enrollment).toBeDefined();
    expect(config.contractsConfigured).toBe(true);
  });
});
