import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEnrollment } from './useEnrollment';

describe('useEnrollment hook', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('handles enroll success', async () => {
    const mockResult = {
      queueId: '1',
      identity: 'user1',
      enrolledAt: '2023-01-01T00:00:00Z',
      conflict: false,
      cancelled: false,
    };
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    } as Response);

    const { result } = renderHook(() => useEnrollment());

    let success;
    await act(async () => {
      success = await result.current.enroll('1', 'user1');
    });

    expect(success).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(mockResult);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/enrollments/enroll'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ queueId: '1', identity: 'user1' }),
    }));
  });

  it('handles conflict (409)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: 'Already enrolled' } }),
    } as Response);

    const { result } = renderHook(() => useEnrollment());

    let success;
    await act(async () => {
      success = await result.current.enroll('1', 'user1');
    });

    expect(success).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Already enrolled');
    expect(result.current.result).toBeNull();
  });

  it('handles network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useEnrollment());

    let success;
    await act(async () => {
      success = await result.current.enroll('1', 'user1');
    });

    expect(success).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Network failure');
  });

  it('handles cancel', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const { result } = renderHook(() => useEnrollment());

    let success;
    await act(async () => {
      success = await result.current.cancel('1', 'user1');
    });

    expect(success).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/enrollments/cancel'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ queueId: '1', identity: 'user1' }),
    }));
  });
});
