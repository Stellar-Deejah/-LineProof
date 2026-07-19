import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import CopyButton from '../components/CopyButton';
import AlertBanner from '../components/AlertBanner';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export type PositionRecord = {
  queueId: string;
  queueName: string;
  identity: string;
  enrolledAt: string;
  cancelled: boolean;
  conflict: boolean;
};

export default function DashboardPage() {
  const [publicKey, setPublicKey] = useState('');
  const [records, setRecords] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const lookup = async () => {
    if (!publicKey.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(`${API_BASE}/enrollments/${encodeURIComponent(publicKey.trim())}`);
      if (res.status === 404) { setRecords([]); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as PositionRecord[];
      setRecords(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const active = records.filter((r) => !r.cancelled);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Your positions</h1>
        <p className="mt-1 text-sm text-slate-600">Look up enrollment records by Stellar public key.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-900">Stellar public key</label>
        <div className="mt-2 flex gap-2">
          <input
            value={publicKey}
            onChange={(e) => setPublicKey(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="G…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="button"
            onClick={lookup}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <Spinner size="sm" className="mx-2" /> : 'Lookup'}
          </button>
        </div>
        {error && (
          <div className="mt-4">
            <AlertBanner variant="error" message={error} />
          </div>
        )}
      </div>

      {searched && !loading && (
        active.length === 0
          ? <EmptyState title="No active enrollments" description="No queue enrollments found for this public key." />
          : (
            <div className="grid gap-4 md:grid-cols-2">
              {active.map((record, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{record.queueId}</h3>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Identity bound" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Enrolled {new Date(record.enrolledAt).toLocaleString()}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="truncate font-mono text-xs text-slate-500">{record.identity}</span>
                    <CopyButton text={record.identity} label="Copy" />
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
