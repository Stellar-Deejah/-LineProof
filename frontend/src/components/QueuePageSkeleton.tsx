import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import Skeleton from './Skeleton';

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2">
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
      <Skeleton className="h-4 w-16 mb-2" />
      <Skeleton className="h-5 w-24" />
    </div>
  );
}

export default function QueuePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-2 text-sm text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Back to queues
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>

        <div className="mt-6">
          <div className="flex justify-between mb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </section>
    </div>
  );
}
