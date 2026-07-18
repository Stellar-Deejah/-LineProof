import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEscrow } from './useEscrow';

describe('useEscrow hook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles deposit success', async () => {
    const mockRecord = {
      id: 'e1',
      queueId: '1',
      identity: 'user1',
      amount: 100,
      asset: 'USDC',
      status: 'Active',
      createdAt: '2023-01-01T00:00:00Z',
      expiresAt: '2023-01-02T00:00:00Z',
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRecord,
    } as Response);

    const { result } = renderHook(() => useEscrow());

    let success;
    await act(async () => {
      success = await result.current.deposit({ queueId: '1', identity: 'user1', amount: 100, asset: 'USDC' });
    });

    expect(success).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.record).toEqual(mockRecord);
  });

  it('handles duplicate deposit error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Duplicate deposit' } }),
    } as Response);

    const { result } = renderHook(() => useEscrow());

    let success;
    await act(async () => {
      success = await result.current.deposit({ queueId: '1', identity: 'user1', amount: 100, asset: 'USDC' });
    });

    expect(success).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Duplicate deposit');
    expect(result.current.record).toBeNull();
  });

  it('handles lookup 404 error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useEscrow());

    let record;
    await act(async () => {
      record = await result.current.lookup('unknown-id');
    });

    expect(record).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('HTTP 404');
    expect(result.current.record).toBeNull();
  });
});
