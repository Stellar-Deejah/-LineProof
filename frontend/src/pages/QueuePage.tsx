import { useState, type FormEvent, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Users, Clock } from 'lucide-react';
import { useQueue } from '../hooks/useQueues';
import { useEnrollment } from '../hooks/useEnrollment';
import QueueStatusBadge from '../components/QueueStatusBadge';
import ProgressBar from '../components/ProgressBar';
import QueuePageSkeleton from '../components/QueuePageSkeleton';
import CopyButton from '../components/CopyButton';
import EscrowStatusCard from '../components/EscrowStatusCard';
import LiveRegion from '../components/LiveRegion';

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700 p-4">
      <dt className="text-xs text-slate-500 dark:text-slate-400">
        <span className="mb-2 block text-slate-500 dark:text-slate-400" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</dd>
    </div>
  );
}

export default function QueuePage() {
  const { id = '' } = useParams();
  const { queue, loading, error } = useQueue(id);
  const { enroll, loading: enrolling, error: enrollError, result } = useEnrollment();

  const [publicKey, setPublicKey] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const { cancel, loading: cancelling, error: cancelError } = useEnrollment();

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

  const handleCancel = async () => {
    if (!result || !result.identity) return;
    const success = await cancel(id, result.identity);
    if (success) {
      setShowCancelConfirm(false);
      // Wait for useEnrollment to clear its result state on success, or force page refresh
    }
  };

  if (loading) return <QueuePageSkeleton />;

  if (error || !queue) return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-400">
      {error ?? 'Queue not found.'}
    </div>
  );

  const pct = queue.maxPositions > 0 ? Math.round((queue.enrolled / queue.maxPositions) * 100) : 0;

  return (
    <div className="space-y-6">
      <LiveRegion type="status" className="sr-only">Content loaded</LiveRegion>
      <Link to="/queues" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50">
        <ArrowLeft className="h-4 w-4" /> Back to queues
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{queue.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{queue.description}</p>
          </div>
          <QueueStatusBadge status={queue.status} />
        </div>

        <dl className="mt-6 grid gap-4 md:grid-cols-3">
          <Stat label="Positions" value={`${queue.enrolled} / ${queue.maxPositions}`} icon={<Users className="h-5 w-5" />} />
          <Stat label="Rule" value={queue.advancementRule} icon={<Clock className="h-5 w-5" />} />
          <Stat label="Escrow" value={`${queue.escrowAmount} ${queue.escrowAsset}`} icon={<ShieldCheck className="h-5 w-5" />} />
        </dl>

        <ProgressBar value={pct} label="Enrollment fill" className="mt-6" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-6 shadow-sm">
        {result && !result.conflict ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Manage position</h3>
              <LiveRegion
                type="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800 p-4 text-sm text-emerald-800 dark:text-emerald-400"
              >
                Enrolled successfully. This position is bound to your identity and cannot be transferred or resold.
              </LiveRegion>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono truncate">{result.identity}</span>
                <CopyButton text={result.identity} label="Copy key" />
              </div>
            </div>

            {queue.escrowAmount > 0 && queue.escrowAsset && (
              <EscrowStatusCard queueId={id} identity={result.identity} />
            )}

            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
                >
                  Cancel enrollment
                </button>
              ) : (
                <div className="rounded-lg border border-red-100 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-4">
                  <p className="text-sm text-red-800 dark:text-red-400 mb-3">
                    Are you sure? This will surrender your position in the queue.
                  </p>
                  {cancelError && (
                    <LiveRegion className="mb-3 text-sm text-red-600 dark:text-red-400">
                      {cancelError}
                    </LiveRegion>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 disabled:opacity-60"
                    >
                      {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={cancelling}
                      className="rounded-lg bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      Keep position
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleEnroll} className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Enroll with your identity</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Your Stellar public key will own this non-transferable position.
              </p>
            </div>
            <input
              value={publicKey}
              aria-label="Stellar public key"
              onChange={(e) => setPublicKey(e.currentTarget.value)}
              placeholder="G…"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            />
            {(inputError || enrollError) && (
              <LiveRegion className="text-sm text-red-600 dark:text-red-400">
                {inputError ?? enrollError}
              </LiveRegion>
            )}
            {result?.conflict && (
              <LiveRegion className="text-sm text-amber-600 dark:text-amber-400">
                This identity is already enrolled in this queue.
              </LiveRegion>
            )}
            <button
              type="submit"
              disabled={enrolling || queue.status === 'Closed'}
              className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-60"
            >
              {enrolling ? 'Submitting…' : 'Enroll now'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
