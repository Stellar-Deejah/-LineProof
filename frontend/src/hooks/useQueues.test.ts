import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQueues, useQueue, clearQueuesCache } from './useQueues';

describe('useQueues hook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    clearQueuesCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles loading and success state', async () => {
    const mockData = [{ id: '1', name: 'Q1' }];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { result } = renderHook(() => useQueues());
    expect(result.current.loading).toBe(true);
    expect(result.current.queues).toEqual([]);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.queues).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('handles error state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useQueues());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('HTTP 500');
  });

  it('handles cleanup (cancelled flag)', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(fetch).mockReturnValueOnce(promise as Promise<Response>);

    const { result, unmount } = renderHook(() => useQueues());
    
    // unmount the component before the fetch resolves
    unmount();
    
    // resolve the fetch
    resolvePromise!({
      ok: true,
      json: async () => [{ id: '1', name: 'Q1' }],
    });

    // Wait a tick to ensure the then block would have executed
    await new Promise((r) => setTimeout(r, 0));

    // state should not be updated since it was cancelled
    expect(result.current.queues).toEqual([]);
    expect(result.current.loading).toBe(true);
  });
});

describe('useQueue hook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles loading and success state', async () => {
    const mockData = { id: '1', name: 'Q1' };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const { result } = renderHook(() => useQueue('1'));
    expect(result.current.loading).toBe(true);
    expect(result.current.queue).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.queue).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('handles error state', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    const { result } = renderHook(() => useQueue('1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('HTTP 404');
  });

  it('does nothing if id is empty', () => {
    const { result } = renderHook(() => useQueue(''));
    expect(result.current.loading).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
