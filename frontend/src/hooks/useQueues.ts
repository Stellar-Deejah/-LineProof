import { useEffect, useState } from 'react';

export type QueueSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  maxPositions: number;
  enrolled: number;
  advanced: number;
  status: 'Draft' | 'EnrollmentOpen' | 'EnrollmentClosed' | 'AdvancementActive' | 'Closed';
  advancementRule: 'FIFO' | 'Priority' | 'VerifiableRandomness';
  escrowAsset: string;
  escrowAmount: number;
  createdAt: string;
};

interface CacheEntry {
  items: QueueSummary[];
  nextCursor: string | null;
  total: number;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const inFlightPromises = new Map<string, Promise<any>>();

export function clearQueuesCache() {
  cache.clear();
  inFlightPromises.clear();
}

function fetchWithDeduplication(url: string): Promise<any> {
  let promise = inFlightPromises.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .finally(() => {
        inFlightPromises.delete(url);
      });
    inFlightPromises.set(url, promise);
  }
  return promise;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export function useQueues(options?: { status?: string; limit?: number }) {
  const status = options?.status;
  const limit = options?.limit ?? 20;

  const [queues, setQueues] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [loadingNextPage, setLoadingNextPage] = useState(false);

  useEffect(() => {
    const cacheKey = `${status || ''}_${limit}`;
    const cached = cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < 30_000) {
      setQueues(cached.items);
      setNextCursor(cached.nextCursor);
      setTotal(cached.total);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const url = `${API_BASE}/queues?limit=${limit}${status ? `&status=${status}` : ''}`;
    fetchWithDeduplication(url)
      .then((json) => {
        const data = (json && typeof json === 'object' && 'items' in json)
          ? (json as { items: QueueSummary[]; nextCursor: string | null; total: number })
          : { items: json as QueueSummary[], nextCursor: null, total: (json as any).length };

        if (!cancelled) {
          setQueues(data.items);
          setNextCursor(data.nextCursor);
          setTotal(data.total);
          setError(null);
          
          cache.set(cacheKey, {
            items: data.items,
            nextCursor: data.nextCursor,
            total: data.total,
            timestamp: Date.now(),
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, limit]);

  const fetchNextPage = async () => {
    if (loading || loadingNextPage || !nextCursor) return;
    setLoadingNextPage(true);
    const url = `${API_BASE}/queues?limit=${limit}${status ? `&status=${status}` : ''}&cursor=${nextCursor}`;
    try {
      const json = await fetchWithDeduplication(url);
      const data = (json && typeof json === 'object' && 'items' in json)
        ? (json as { items: QueueSummary[]; nextCursor: string | null; total: number })
        : { items: json as QueueSummary[], nextCursor: null, total: (json as any).length };
      
      setQueues((prev) => {
        const updated = [...prev, ...data.items];
        const cacheKey = `${status || ''}_${limit}`;
        cache.set(cacheKey, {
          items: updated,
          nextCursor: data.nextCursor,
          total: data.total,
          timestamp: Date.now(),
        });
        return updated;
      });
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingNextPage(false);
    }
  };

  return {
    queues,
    loading,
    error,
    hasMore: nextCursor !== null,
    fetchNextPage,
    loadingNextPage,
    total,
  };
}

export function useQueue(id: string) {
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/queues/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<QueueSummary>;
      })
      .then((data) => {
        if (!cancelled) {
          setQueue(data);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  return { queue, loading, error };
}
