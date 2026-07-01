import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export type EscrowRecord = {
  id: string;
  queueId: string;
  identity: string;
  amount: number;
  asset: string;
  status: 'Active' | 'Released' | 'Refunded' | 'Expired';
  createdAt: string;
  expiresAt: string;
  releasedAt?: string;
};

export function useEscrow() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<EscrowRecord | null>(null);

  const deposit = async (payload: { queueId: string; identity: string; amount: number; asset: string }): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/escrow/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.error?.message ?? `HTTP ${res.status}`); return false; }
      setRecord(json as EscrowRecord);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      return false;
    } finally { setLoading(false); }
  };

  const lookup = async (escrowId: string): Promise<EscrowRecord | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/escrow/${encodeURIComponent(escrowId)}`);
      if (!res.ok) { setError(`HTTP ${res.status}`); return null; }
      const json = await res.json() as EscrowRecord;
      setRecord(json);
      return json;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      return null;
    } finally { setLoading(false); }
  };

  return { deposit, lookup, loading, error, record };
}
