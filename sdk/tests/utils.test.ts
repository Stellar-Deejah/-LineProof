import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  validateSlug,
  MAX_SLUG_LENGTH,
  encodeScAddress,
  encodeScU32,
  encodeScU64,
  encodeScI128,
  encodeScSymbol,
  encodeScBool,
  encodeScBytes,
} from "../src/utils";
import { SDKError } from "../src/types";
import { Keypair, xdr } from "@stellar/stellar-sdk";

// ═══════════════════════════════════════════════════════════════════════════════
// Retry Infrastructure Tests (Issue #37)
// ═══════════════════════════════════════════════════════════════════════════════

describe("calculateBackoff", () => {
  it("returns deterministic delay with jitterFactor=0", () => {
    expect(calculateBackoff(0, 100, 10000, 0)).toBe(100);
    expect(calculateBackoff(1, 100, 10000, 0)).toBe(200);
    expect(calculateBackoff(2, 100, 10000, 0)).toBe(400);
    expect(calculateBackoff(3, 100, 10000, 0)).toBe(800);
  });

  it("caps at maxDelayMs", () => {
    expect(calculateBackoff(10, 100, 500, 0)).toBe(500);
  });

  it("applies blended jitter within expected range", () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateBackoff(2, 100, 10000, 0.5);
      // deterministic = 400 * 0.5 = 200, jittered max = 400 * 0.5 = 200
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(400);
    }
  });
});

describe("classifyError", () => {
  it("classifies tx_bad_seq as RETRYABLE_SEQUENCE", () => {
    const err = new Error("tx_bad_seq");
    (err as any).extras = { result_codes: { transaction: "tx_bad_seq" } };
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_SEQUENCE);
  });

  it("classifies tx_bad_auth as TERMINAL_INVALID", () => {
    const err = new Error("tx_bad_auth");
    (err as any).extras = { result_codes: { transaction: "tx_bad_auth" } };
    expect(classifyError(err)).toBe(ErrorCategory.TERMINAL_INVALID);
  });

  it("classifies ECONNRESET as RETRYABLE_NETWORK", () => {
    const err = new Error("Connection reset");
    (err as any).code = "ECONNRESET";
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it("classifies ETIMEDOUT as RETRYABLE_NETWORK", () => {
    const err = new Error("timeout");
    (err as any).code = "ETIMEDOUT";
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it("classifies 500 as RETRYABLE_NETWORK", () => {
    const err = new Error("Internal Server Error");
    (err as any).status = 500;
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it("classifies 400 as TERMINAL_INVALID", () => {
    const err = new Error("Bad Request");
    (err as any).status = 400;
    expect(classifyError(err)).toBe(ErrorCategory.TERMINAL_INVALID);
  });

  it("classifies 429 as RETRYABLE_NETWORK", () => {
    const err = new Error("Too Many Requests");
    (err as any).status = 429;
    expect(classifyError(err)).toBe(ErrorCategory.RETRYABLE_NETWORK);
  });

  it("classifies unknown errors as UNKNOWN", () => {
    expect(classifyError(new Error("weird"))).toBe(ErrorCategory.UNKNOWN);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, { maxRetries: 2, timeoutMs: 5000 });
    expect(result.result).toBe("success");
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network failure and succeeds on 2nd attempt", async () => {
    const networkError = new Error("Connection reset");
    (networkError as any).code = "ECONNRESET";
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce("success");

    const promise = withRetry(fn, {
      maxRetries: 3,
      timeoutMs: 5000,
      baseDelayMs: 100,
      jitterFactor: 0,
    });
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result.result).toBe("success");
    expect(result.attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries up to maxRetries then throws", async () => {
    const networkError = new Error("Connection reset");
    (networkError as any).code = "ECONNRESET";
    const fn = vi.fn().mockRejectedValue(networkError);

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        timeoutMs: 5000,
        baseDelayMs: 10,
        jitterFactor: 0,
      }),
    ).rejects.toThrow("Connection reset");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry terminal errors (4xx)", async () => {
    const terminalError = new Error("Bad Request");
    (terminalError as any).status = 400;
    const fn = vi.fn().mockRejectedValue(terminalError);

    await expect(
      withRetry(fn, { maxRetries: 3, timeoutMs: 5000 }),
    ).rejects.toThrow("Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry tx_bad_auth", async () => {
    const authError = new Error("Bad auth");
    (authError as any).extras = {
      result_codes: { transaction: "tx_bad_auth" },
    };
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(
      withRetry(fn, { maxRetries: 3, timeoutMs: 5000 }),
    ).rejects.toThrow("Bad auth");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls sequenceRefetch on tx_bad_seq before retrying", async () => {
    const seqError = new Error("Bad sequence");
    (seqError as any).extras = { result_codes: { transaction: "tx_bad_seq" } };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(seqError)
      .mockResolvedValueOnce("success");
    const sequenceRefetch = vi.fn().mockResolvedValue(undefined);

    const promise = withRetry(
      fn,
      { maxRetries: 3, timeoutMs: 5000, baseDelayMs: 10, jitterFactor: 0 },
      sequenceRefetch,
    );
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result.result).toBe("success");
    expect(sequenceRefetch).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws if sequenceRefetch fails", async () => {
    const seqError = new Error("Bad sequence");
    (seqError as any).extras = { result_codes: { transaction: "tx_bad_seq" } };
    const fn = vi.fn().mockRejectedValue(seqError);
    const sequenceRefetch = vi.fn().mockRejectedValue(new Error("RPC down"));

    await expect(
      withRetry(fn, { maxRetries: 3, timeoutMs: 5000 }, sequenceRefetch),
    ).rejects.toThrow("Failed to re-fetch account sequence");
  });

  it("enforces timeout and aborts the operation", async () => {
    const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve("too late"), 10000);
        signal.addEventListener("abort", () => clearTimeout(timer));
      });
    });

    await expect(
      withRetry(fn, { maxRetries: 0, timeoutMs: 100 }),
    ).rejects.toThrow("timed out");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry callback with correct context", async () => {
    const networkError = new Error("Connection reset");
    (networkError as any).code = "ECONNRESET";
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce("success");
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
      }),
    );
  });

  it("passes AbortSignal to the function", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    await withRetry(fn, { maxRetries: 0, timeoutMs: 5000 });
    expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
});

describe("createTimeoutPromise", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects after specified timeout", async () => {
    const promise = createTimeoutPromise(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).rejects.toThrow(
      "Transaction submission timed out after 1000ms",
    );
  });

  it("rejects immediately when signal is aborted", async () => {
    const controller = new AbortController();
    const promise = createTimeoutPromise(10000, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow("Transaction submission aborted");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Existing Utility Tests (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

describe("assertValidAddress", () => {
  it("does not throw for a real valid Stellar public key", () => {
    const key = Keypair.random().publicKey();
    expect(() => assertValidAddress(key)).not.toThrow();
  });

  it("throws SDKError for a non-G-prefix key", () => {
    expect(() =>
      assertValidAddress(
        "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toThrow(SDKError);
  });

  it("throws SDKError for a malformed key", () => {
    expect(() => assertValidAddress("NOTAKEY")).toThrow(SDKError);
  });
});

describe("toStroops / fromStroops", () => {
  it("converts 1.0 to 10000000 stroops", () => {
    expect(toStroops(1.0)).toBe(10_000_000n);
  });

  it("converts 0.5 to 5000000 stroops", () => {
    expect(toStroops(0.5)).toBe(5_000_000n);
  });

  it("converts large decimal strings without precision loss", () => {
    expect(toStroops("900719925.4740992")).toBe(9_007_199_254_740_992n);
  });

  it("converts back from stroops to readable", () => {
    expect(fromStroops(10_000_000n)).toBe("1");
    expect(fromStroops(5_000_000n)).toBe("0.5");
  });

  it("throws for negative amounts", () => {
    expect(() => toStroops(-1)).toThrow(SDKError);
  });

  // ── #88: floating-point precision, input validation, string input ──

  it("converts one stroop from a string without truncation", () => {
    expect(toStroops("0.0000001")).toBe(1n);
  });

  it("converts one stroop from a number without floating-point truncation", () => {
    // 0.0000001 * 10_000_000 is 0.09999999999999999 in float; the old
    // implementation rounded that to 0n. The string path must return 1n.
    expect(toStroops(0.0000001)).toBe(1n);
  });

  it("accepts both string and number inputs", () => {
    expect(toStroops("123.456789")).toBe(toStroops(123.456789));
    expect(toStroops("1")).toBe(10_000_000n);
  });

  it("throws SDKError for NaN", () => {
    expect(() => toStroops(NaN)).toThrow(SDKError);
    expect(() => toStroops(NaN)).toThrow(/finite/i);
  });

  it("throws SDKError for Infinity", () => {
    expect(() => toStroops(Infinity)).toThrow(SDKError);
    expect(() => toStroops(-Infinity)).toThrow(SDKError);
  });

  it("throws SDKError for a malformed string", () => {
    expect(() => toStroops("abc")).toThrow(SDKError);
    expect(() => toStroops("1.2.3")).toThrow(SDKError);
  });

  it("throws SDKError for negative string amounts", () => {
    expect(() => toStroops("-5")).toThrow(SDKError);
  });

  it("throws SDKError for sub-stroop precision", () => {
    expect(() => toStroops("0.00000001")).toThrow(SDKError);
  });

  it("throws SDKError for values that overflow i128", () => {
    expect(() => toStroops("99999999999999999999999999999999")).toThrow(
      SDKError,
    );
  });

  it("fromStroops handles whole numbers, fractions, one stroop, and large amounts", () => {
    expect(fromStroops(10_000_000n)).toBe("1");
    expect(fromStroops(1n)).toBe("0.0000001");
    expect(fromStroops(5_000_000n)).toBe("0.5");
    expect(fromStroops(123_456_789_000_0000n)).toBe("123456789");
  });

  it("round-trips a fractional amount, dropping trailing zeros", () => {
    expect(fromStroops(toStroops("123.4567890"))).toBe("123.456789");
  });
});

describe("validateSlug (#86)", () => {
  it("accepts a typical hyphenated slug", () => {
    expect(() => validateSlug("sneaker-drop-001")).not.toThrow();
    expect(() => validateSlug("visa-appointment-001")).not.toThrow();
    expect(() => validateSlug("q")).not.toThrow();
  });

  it("accepts a slug at the maximum length", () => {
    expect(() => validateSlug("a".repeat(MAX_SLUG_LENGTH))).not.toThrow();
  });

  it("rejects a slug over the maximum length", () => {
    expect(() => validateSlug("a".repeat(MAX_SLUG_LENGTH + 1))).toThrow(
      SDKError,
    );
  });

  it("rejects an empty slug", () => {
    expect(() => validateSlug("")).toThrow(SDKError);
  });

  it("rejects uppercase, spaces, and invalid characters", () => {
    expect(() => validateSlug("Sneaker-Drop")).toThrow(SDKError);
    expect(() => validateSlug("sneaker drop")).toThrow(SDKError);
    expect(() => validateSlug("sneaker_drop")).toThrow(SDKError);
    expect(() => validateSlug("sneaker.drop")).toThrow(SDKError);
  });

  it("rejects leading, trailing, or doubled hyphens", () => {
    expect(() => validateSlug("-sneaker")).toThrow(SDKError);
    expect(() => validateSlug("sneaker-")).toThrow(SDKError);
    expect(() => validateSlug("sneaker--drop")).toThrow(SDKError);
  });
});

describe("nowSeconds", () => {
  it("returns a number close to Date.now() / 1000", () => {
    const expected = Math.floor(Date.now() / 1000);
    expect(Math.abs(nowSeconds() - expected)).toBeLessThanOrEqual(1);
  });
});

describe("daysFromNow", () => {
  it("returns nowSeconds + days * 86400", () => {
    const now = nowSeconds();
    expect(daysFromNow(1)).toBeGreaterThanOrEqual(now + 86400 - 1);
    expect(daysFromNow(1)).toBeLessThanOrEqual(now + 86400 + 1);
  });
});

describe("truncateAddress", () => {
  it("truncates a long address with ellipsis", () => {
    const addr = "G" + "A".repeat(55);
    const result = truncateAddress(addr, 6);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(addr.length);
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("GABC", 6)).toBe("GABC");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Soroban ScVal Encoding Tests (Issue #Problem1)
// ═══════════════════════════════════════════════════════════════════════════════

describe("encodeScAddress", () => {
  it("encodes a valid Stellar public key to ScVal", () => {
    const addr = Keypair.random().publicKey();
    const encoded = encodeScAddress(addr);
    expect(encoded).toBeDefined();
    expect(encoded.switch().name).toBe("scvAddress");
  });

  it("throws SDKError for invalid address", () => {
    expect(() => encodeScAddress("INVALID")).toThrow(SDKError);
    expect(() =>
      encodeScAddress(
        "SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      ),
    ).toThrow(SDKError);
  });

  it("throws SDKError for empty string", () => {
    expect(() => encodeScAddress("")).toThrow(SDKError);
  });
});

describe("encodeScU32", () => {
  it("encodes a 32-bit unsigned integer", () => {
    const encoded = encodeScU32(42);
    expect(encoded.switch().name).toBe("scvU32");
    expect(encoded.u32().toString()).toBe("42");
  });

  it("encodes 0", () => {
    const encoded = encodeScU32(0);
    expect(encoded.u32().toString()).toBe("0");
  });

  it("encodes max U32 (4294967295)", () => {
    const encoded = encodeScU32(4_294_967_295);
    expect(encoded.u32().toString()).toBe("4294967295");
  });

  it("throws SDKError for negative values", () => {
    expect(() => encodeScU32(-1)).toThrow(SDKError);
  });

  it("throws SDKError for values exceeding U32 max", () => {
    expect(() => encodeScU32(4_294_967_296)).toThrow(SDKError);
  });

  it("throws SDKError for non-integers", () => {
    expect(() => encodeScU32(3.14)).toThrow(SDKError);
  });
});

describe("encodeScU64", () => {
  it("encodes a 64-bit unsigned integer from BigInt", () => {
    const encoded = encodeScU64(BigInt(1000));
    expect(encoded.switch().name).toBe("scvU64");
  });

  it("encodes a 64-bit unsigned integer from number", () => {
    const encoded = encodeScU64(42);
    expect(encoded.switch().name).toBe("scvU64");
  });

  it("encodes 0", () => {
    const encoded = encodeScU64(0n);
    expect(encoded.switch().name).toBe("scvU64");
  });

  it("throws SDKError for negative values", () => {
    expect(() => encodeScU64(-1n)).toThrow(SDKError);
  });

  it("throws SDKError for values exceeding U64 max", () => {
    expect(() => encodeScU64(BigInt("18446744073709551616"))).toThrow(SDKError);
  });
});

describe("encodeScI128", () => {
  it("encodes a positive 128-bit signed integer", () => {
    const encoded = encodeScI128(BigInt(1000));
    expect(encoded.switch().name).toBe("scvI128");
  });

  it("encodes from number", () => {
    const encoded = encodeScI128(42);
    expect(encoded.switch().name).toBe("scvI128");
  });

  it("encodes 0", () => {
    const encoded = encodeScI128(0n);
    expect(encoded.switch().name).toBe("scvI128");
  });

  it("throws SDKError for values exceeding I128 max", () => {
    expect(() =>
      encodeScI128(BigInt("170141183460469231731687303715884105728")),
    ).toThrow(SDKError);
  });

  it("throws SDKError for values less than I128 min", () => {
    expect(() =>
      encodeScI128(BigInt("-170141183460469231731687303715884105729")),
    ).toThrow(SDKError);
  });
});

describe("encodeScSymbol", () => {
  it("encodes a symbol", () => {
    const encoded = encodeScSymbol("test-queue");
    expect(encoded.switch().name).toBe("scvSymbol");
    expect(encoded.sym().toString()).toBe("test-queue");
  });

  it("encodes a single character symbol", () => {
    const encoded = encodeScSymbol("a");
    expect(encoded.switch().name).toBe("scvSymbol");
  });

  it("throws SDKError for empty symbol", () => {
    expect(() => encodeScSymbol("")).toThrow(SDKError);
  });

  it("throws SDKError for non-string input", () => {
    expect(() => encodeScSymbol(null as any)).toThrow(SDKError);
  });
});

describe("encodeScBool", () => {
  it("encodes true", () => {
    const encoded = encodeScBool(true);
    expect(encoded.switch().name).toBe("scvBool");
    expect(encoded.b()).toBe(true);
  });

  it("encodes false", () => {
    const encoded = encodeScBool(false);
    expect(encoded.switch().name).toBe("scvBool");
    expect(encoded.b()).toBe(false);
  });
});

describe("encodeScBytes", () => {
  it("encodes a Buffer", () => {
    const buffer = Buffer.from("hello");
    const encoded = encodeScBytes(buffer);
    expect(encoded.switch().name).toBe("scvBytes");
  });

  it("encodes a Uint8Array", () => {
    const arr = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeScBytes(arr);
    expect(encoded.switch().name).toBe("scvBytes");
  });

  it("throws SDKError for invalid input", () => {
    expect(() => encodeScBytes("not bytes" as any)).toThrow(SDKError);
    expect(() => encodeScBytes(123 as any)).toThrow(SDKError);
  });
});
