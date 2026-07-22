import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  classifyError,
  calculateBackoff,
  ErrorCategory,
  DEFAULT_RETRY_CONFIG,
  createTimeoutPromise,
  assertValidAddress,
  toStroops,
  fromStroops,
  nowSeconds,
  daysFromNow,
  truncateAddress,
  generateTestKeypair,
} from '../src/utils';
import { SDKError } from '../src/types';
import { Keypair } from '@stellar/stellar-sdk';

// ═══════════════════════════════════════════════════════════════════════════════
// Retry Infrastructure Tests (Issue #37)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateBackoff', () => {
  it('returns deterministic delay with jitterFactor=0', () => {
    expect(calculateBackoff(0, 100, 10000, 0)).toBe(100);
    expect(calculateBackoff(1, 100, 10000, 0)).toBe(200);
    expect(calculateBackoff(2, 100, 10000, 0)).toBe(400);
    expect(calculateBackoff(3, 100, 10000, 0)).toBe(800);
  });

  it('caps at maxDelayMs', () => {
    expect(calculateBackoff(10, 100, 500, 0)).toBe(500);
  });

  it('applies blended jitter within expected range', () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateBackoff(2, 100, 10000, 0.5);
      // deterministic = 400 * 0.5 = 200, jittered max = 400 * 0.5 = 200
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(400);
    }
  });
});

describe('classifyError', () => {
  it('classifies tx_bad_seq as RETRYABLE_SEQUENCE', () => {
    const err = new Error('tx_bad_seq');
    (err as any).extras = { result_codes: { transaction: 'tx_bad_seq' } };
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_SEQUENCE);
  });

  it('classifies tx_bad_auth as TERMINAL_INVALID', () => {
    const err = new Error('tx_bad_auth');
    (err as any).extras = { result_codes: { transaction: 'tx_bad_auth' } };
    expect(classifyError(err)).toBe(ErrorCategory.TERMINAL_INVALID);
  });

  it('classifies ECONNRESET as RETRYABLE_NETWORK', () => {
    const err = new Error('Connection reset');
    (err as any).code = 'ECONNRESET';
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it('classifies ETIMEDOUT as RETRYABLE_NETWORK', () => {
    const err = new Error('timeout');
    (err as any).code = 'ETIMEDOUT';
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it('classifies 500 as RETRYABLE_NETWORK', () => {
    const err = new Error('Internal Server Error');
    (err as any).status = 500;
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it('classifies 400 as TERMINAL_INVALID', () => {
    const err = new Error('Bad Request');
    (err as any).status = 400;
    expect(classifyError(err)).toBe(ErrorCategory.TERMINAL_INVALID);
  });

  it('classifies 429 as RETRYABLE_NETWORK', () => {
    const err = new Error('Too Many Requests');
    (err as any).status = 429;
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it('classifies unknown errors as UNKNOWN', () => {
    expect(classifyError(new Error('weird'))).toBe(ErrorCategory.UNKNOWN);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 2, timeoutMs: 5000 });
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure and succeeds on 2nd attempt', async () => {
    const networkError = new Error('Connection reset');
    (networkError as any).code = 'ECONNRESET';
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { maxRetries: 3, timeoutMs: 5000, baseDelayMs: 100, jitterFactor: 0 });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result.result).toBe('success');
    expect(result.attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxRetries then throws', async () => {
    const networkError = new Error('Connection reset');
    (networkError as any).code = 'ECONNRESET';
    const fn = vi.fn().mockRejectedValue(networkError);

    const promise = withRetry(fn, { maxRetries: 2, timeoutMs: 5000, baseDelayMs: 10, jitterFactor: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toThrow('Connection reset');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry terminal errors (4xx)', async () => {
    const terminalError = new Error('Bad Request');
    (terminalError as any).status = 400;
    const fn = vi.fn().mockRejectedValue(terminalError);

    await expect(withRetry(fn, { maxRetries: 3, timeoutMs: 5000 })).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry tx_bad_auth', async () => {
    const authError = new Error('Bad auth');
    (authError as any).extras = { result_codes: { transaction: 'tx_bad_auth' } };
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(withRetry(fn, { maxRetries: 3, timeoutMs: 5000 })).rejects.toThrow('Bad auth');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls sequenceRefetch on tx_bad_seq before retrying', async () => {
    const seqError = new Error('Bad sequence');
    (seqError as any).extras = { result_codes: { transaction: 'tx_bad_seq' } };
    const fn = vi.fn()
      .mockRejectedValueOnce(seqError)
      .mockResolvedValueOnce('success');
    const sequenceRefetch = vi.fn().mockResolvedValue(undefined);

    const promise = withRetry(
      fn,
      { maxRetries: 3, timeoutMs: 5000, baseDelayMs: 10, jitterFactor: 0 },
      sequenceRefetch,
    );
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result.result).toBe('success');
    expect(sequenceRefetch).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws if sequenceRefetch fails', async () => {
    const seqError = new Error('Bad sequence');
    (seqError as any).extras = { result_codes: { transaction: 'tx_bad_seq' } };
    const fn = vi.fn().mockRejectedValue(seqError);
    const sequenceRefetch = vi.fn().mockRejectedValue(new Error('RPC down'));

    await expect(
      withRetry(fn, { maxRetries: 3, timeoutMs: 5000 }, sequenceRefetch)
    ).rejects.toThrow('Failed to re-fetch account sequence');
  });

  it('enforces timeout and aborts the operation', async () => {
    const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('too late'), 10000);
        signal.addEventListener('abort', () => clearTimeout(timer));
      });
    });

    await expect(
      withRetry(fn, { maxRetries: 0, timeoutMs: 100 })
    ).rejects.toThrow('timed out');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry callback with correct context', async () => {
    const networkError = new Error('Connection reset');
    (networkError as any).code = 'ECONNRESET';
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('success');
    const onRetry = vi.fn();

    const promise = withRetry(
      fn,
      { maxRetries: 3, timeoutMs: 5000, baseDelayMs: 10, jitterFactor: 0 },
      undefined,
      onRetry,
    );
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 0,
        category: ErrorCategory.RETRYABLE_NETWORK,
        willRetry: true,
      })
    );
  });

  it('passes AbortSignal to the function', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    await withRetry(fn, { maxRetries: 0, timeoutMs: 5000 });
    expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
});

describe('createTimeoutPromise', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects after specified timeout', async () => {
    const promise = createTimeoutPromise(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).rejects.toThrow('timed out after 1000ms');
  });

  it('rejects immediately when signal is aborted', async () => {
    const controller = new AbortController();
    const promise = createTimeoutPromise(10000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow('aborted');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Existing Utility Tests (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

describe('assertValidAddress', () => {
  it('does not throw for a real valid Stellar public key', () => {
    const key = Keypair.random().publicKey();
    expect(() => assertValidAddress(key)).not.toThrow();
  });

  it('throws SDKError for a non-G-prefix key', () => {
    expect(() => assertValidAddress('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toThrow(SDKError);
  });

  it('throws SDKError for a malformed key', () => {
    expect(() => assertValidAddress('NOTAKEY')).toThrow(SDKError);
  });
});

describe('toStroops / fromStroops', () => {
  it('converts 1.0 to 10000000 stroops', () => {
    expect(toStroops(1.0)).toBe(10_000_000n);
  });

  it('converts 0.5 to 5000000 stroops', () => {
    expect(toStroops(0.5)).toBe(5_000_000n);
  });

  it('converts back from stroops to readable', () => {
    expect(fromStroops(10_000_000n)).toBe('1');
    expect(fromStroops(5_000_000n)).toBe('0.5');
  });

  it('throws for negative amounts', () => {
    expect(() => toStroops(-1)).toThrow(SDKError);
  });
});

describe('nowSeconds', () => {
  it('returns a number close to Date.now() / 1000', () => {
    const expected = Math.floor(Date.now() / 1000);
    expect(Math.abs(nowSeconds() - expected)).toBeLessThanOrEqual(1);
  });
});

describe('daysFromNow', () => {
  it('returns nowSeconds + days * 86400', () => {
    const now = nowSeconds();
    expect(daysFromNow(1)).toBeGreaterThanOrEqual(now + 86400 - 1);
    expect(daysFromNow(1)).toBeLessThanOrEqual(now + 86400 + 1);
  });
});

describe('truncateAddress', () => {
  it('truncates a long address with ellipsis', () => {
    const addr = 'G' + 'A'.repeat(55);
    const result = truncateAddress(addr, 6);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(addr.length);
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('GABC', 6)).toBe('GABC');
  });
});

describe('generateTestKeypair', () => {
  it('returns a publicKey starting with G', () => {
    const kp = generateTestKeypair();
    expect(kp.publicKey).toMatch(/^G/);
  });

  it('returns a secretKey starting with S', () => {
    const kp = generateTestKeypair();
    expect(kp.secretKey).toMatch(/^S/);
  });

  it('returns different keypairs on each call', () => {
    const kp1 = generateTestKeypair();
    const kp2 = generateTestKeypair();
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });
});