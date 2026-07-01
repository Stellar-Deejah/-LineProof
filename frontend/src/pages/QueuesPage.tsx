import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useQueues } from '../hooks/useQueues';
import QueueStatusBadge from '../components/QueueStatusBadge';
import ProgressBar from '../components/ProgressBar';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

export default function QueuesPage() {
  const { queues, loading, error } = useQueues();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Spinner size="sm" /> Loading queues…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load queues: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Queues</h1>
        <p className="mt-1 text-sm text-slate-600">Browse public waiting lists and verify on-chain enrollment proofs.</p>
      </div>

      {queues.length === 0 ? (
        <EmptyState title="No queues found" description="No public queues are available right now." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {queues.map((queue) => {
            const pct = queue.maxPositions > 0
              ? Math.round((queue.enrolled / queue.maxPositions) * 100)
              : 0;
            return (
              <Link
                key={queue.id}
                to={`/queues/${queue.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{queue.name}</h3>
                  <QueueStatusBadge status={queue.status as any} />
                </div>
                <p className="mt-1 text-sm text-slate-500 line-clamp-2">{queue.description}</p>
                <ProgressBar value={pct} label={`${queue.enrolled} / ${queue.maxPositions} enrolled`} className="mt-4" />
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{queue.advancementRule}</span>
                  <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                    View <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
