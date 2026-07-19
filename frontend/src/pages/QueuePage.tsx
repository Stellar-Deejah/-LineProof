import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Users, Clock } from 'lucide-react';
import { useQueue } from '../hooks/useQueues';
import { useEnrollment } from '../hooks/useEnrollment';
import QueueStatusBadge from '../components/QueueStatusBadge';
import ProgressBar from '../components/ProgressBar';
import Spinner from '../components/Spinner';
import CopyButton from '../components/CopyButton';
import AlertBanner from '../components/AlertBanner';

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-slate-500">{icon}</div>
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function QueuePage() {
  const { id = '' } = useParams();
  const { queue, loading, error } = useQueue(id);
  const { enroll, loading: enrolling, error: enrollError, result } = useEnrollment();

  const [publicKey, setPublicKey] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const looksLikeStellar = (v: string) => /^G[A-Z0-9]{55}$/.test(v);

  const handleEnroll = async (e: FormEvent) => {
    e.preventDefault();
    setInputError(null);
    if (!looksLikeStellar(publicKey)) {
      setInputError('Enter a valid Stellar public key (starts with G, 56 characters).');
      return;
    }
    await enroll(id, publicKey);
  };

  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-slate-600"><Spinner size="sm" /> Loading queue…</div>
  );

  if (error || !queue) return (
    <AlertBanner variant="error" message={error ?? 'Queue not found.'} />
  );

  const pct = queue.maxPositions > 0 ? Math.round((queue.enrolled / queue.maxPositions) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link to="/queues" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to queues
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{queue.name}</h2>
            <p className="mt-1 text-sm text-slate-600">{queue.description}</p>
          </div>
          <QueueStatusBadge status={queue.status as any} />
        </div>

        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          <Stat label="Positions" value={`${queue.enrolled} / ${queue.maxPositions}`} icon={<Users className="h-5 w-5" />} />
          <Stat label="Rule" value={queue.advancementRule} icon={<Clock className="h-5 w-5" />} />
          <Stat label="Escrow" value={`${queue.escrowAmount} ${queue.escrowAsset}`} icon={<ShieldCheck className="h-5 w-5" />} />
        </dl>

        <ProgressBar value={pct} label="Enrollment fill" className="mt-6" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {result && !result.conflict ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Enrolled successfully. This position is bound to your identity and cannot be transferred or resold.
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono truncate">{result.identity}</span>
              <CopyButton text={result.identity} label="Copy key" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleEnroll} className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Enroll with your identity</h3>
              <p className="text-sm text-slate-600 mt-1">
                Your Stellar public key will own this non-transferable position.
              </p>
            </div>
            <input
              value={publicKey}
              onChange={(e) => setPublicKey(e.currentTarget.value)}
              placeholder="G…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            {(inputError || enrollError) && (
              <AlertBanner variant="error" message={inputError ?? enrollError ?? ''} />
            )}
            {result?.conflict && (
              <AlertBanner variant="warning" message="This identity is already enrolled in this queue." />
            )}
            <button
              type="submit"
              disabled={enrolling || queue.status === 'Closed'}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {enrolling ? 'Submitting…' : 'Enroll now'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
