import { config } from '../config.js';
import { ContractReadUnavailableError, type ContractAdapter, type OnChainQueue } from './adapter.js';
import { SorobanContractAdapter } from './sorobanContractAdapter.js';

export type {
  ContractAdapter,
  OnChainQueue,
  OnChainEnrollment,
  OnChainEscrow,
} from './adapter.js';
export { ContractReadUnavailableError } from './adapter.js';
export { SorobanContractAdapter } from './sorobanContractAdapter.js';

/**
 * Process-wide contract adapter, built from the loaded contract IDs. Present
 * whenever at least one contract ID is configured; otherwise `undefined` and the
 * backend serves purely local state.
 */
export const contractAdapter: ContractAdapter | undefined = config.contractsConfigured
  ? new SorobanContractAdapter(config)
  : undefined;

/**
 * Best-effort on-chain read for a queue, used by GET routes to prefer
 * authoritative state.
 *
 * Fallback strategy: returns `undefined` when contracts are not configured or
 * the read path is unavailable (so the caller uses local state), and only
 * rethrows genuinely unexpected errors. This keeps the API responsive when the
 * Soroban RPC is unreachable rather than failing the request.
 */
export async function readQueueOnChain(queueId: string): Promise<OnChainQueue | undefined> {
  if (!contractAdapter || !contractAdapter.isConfigured()) return undefined;
  try {
    return await contractAdapter.getQueue(queueId);
  } catch (err) {
    if (err instanceof ContractReadUnavailableError) {
      // Expected while the SDK read path is pending / RPC is down — fall back.
      return undefined;
    }
    throw err;
  }
}
