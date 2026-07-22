import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useQueues } from '../hooks/useQueues';
import QueueStatusBadge from '../components/QueueStatusBadge';
import ProgressBar from '../components/ProgressBar';
import Skeleton from '../components/Skeleton';
import LiveRegion from '../components/LiveRegion';
import EmptyState from '../components/EmptyState';
import AlertBanner from '../components/AlertBanner';
import { useEffect, useRef } from 'react';

export default function QueuesPage() {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { queues, loading, error, hasMore, fetchNextPage, loadingNextPage } = useQueues({ limit: 20 });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }
    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [hasMore, fetchNextPage]);

  if (loading && queues.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Queues</h1>
          <p className="mt-1 text-sm text-slate-600">Browse public waiting lists and verify on-chain enrollment proofs.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Skeleton className="h-6 w-3/4 mb-1" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-2/3" />
              
              <div className="mt-4">
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <AlertBanner variant="error" message={`Failed to load queues: ${error}`} />;
  if (error && queues.length === 0) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load queues: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LiveRegion type="status" className="sr-only">Content loaded</LiveRegion>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Queues</h1>
        <p className="mt-1 text-sm text-slate-600">Browse public waiting lists and verify on-chain enrollment proofs.</p>
      </div>

      {queues.length === 0 ? (
        <EmptyState title="No queues found" description="No public queues are available right now." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {queues.map((queue) => {
              const pct = queue.maxPositions > 0
                ? Math.round((queue.enrolled / queue.maxPositions) * 100)
                : 0;
              return (
                <Link
                  key={queue.id}
                  to={`/queues/${queue.id}`}
                  aria-label={queue.name}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: 'auto 200px',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{queue.name}</h2>
                    <QueueStatusBadge status={queue.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{queue.description}</p>
                  <ProgressBar
                    value={pct}
                    label={`${queue.enrolled} / ${queue.maxPositions} enrolled`}
                    className="mt-4"
                    ariaHidden
                  />
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

          {/* Sentinel element for infinite scroll */}
          {hasMore && (
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingNextPage && <Spinner size="sm" />}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Failed to load more queues: {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
