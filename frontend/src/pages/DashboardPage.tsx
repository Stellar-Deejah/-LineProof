import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import CopyButton from '../components/CopyButton';
import LiveRegion from '../components/LiveRegion';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

export type PositionRecord = {
  queueId: string;
  queueName: string;
  identity: string;
  enrolledAt: string;
  cancelled: boolean;
  conflict: boolean;
  escrowStatus?: string;
  positionId?: number;
  advanced?: boolean;
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
      if (Array.isArray(data)) {
        const enriched = await Promise.all(data.map(async (r) => {
          try {
            const eRes = await fetch(`${API_BASE}/escrow/${encodeURIComponent(`${r.queueId}:${r.identity}`)}`);
            if (eRes.ok) {
              const eData = await eRes.json();
              r.escrowStatus = eData.status;
            }
          } catch { /* ignore */ }
          return r;
        }));
        setRecords(enriched);
      } else {
        setRecords([]);
      }
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
        <label htmlFor="dashboard-public-key" className="block text-sm font-medium text-slate-900">
          Stellar public key
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="dashboard-public-key"
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
          <LiveRegion className="mt-2 text-sm text-red-600">
            {error}
          </LiveRegion>
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
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-semibold text-slate-900">{record.queueId}</h3>
                      {record.escrowStatus && (
                        <span className="w-max inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-800">
                          Escrow: {record.escrowStatus}
                        </span>
                      )}
                    </div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Identity bound" />
                  </div>
                  <dl>
                    <div className="mt-1">
                      <dt className="sr-only">Enrolled at</dt>
                      <dd className="text-xs text-slate-500">
                        Enrolled {new Date(record.enrolledAt).toLocaleString()}
                      </dd>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <dt className="sr-only">Identity</dt>
                      <dd className="truncate font-mono text-xs text-slate-500">{record.identity}</dd>
                      <CopyButton text={record.identity} label="Copy" />
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
