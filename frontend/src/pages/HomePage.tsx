import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Clock, Users, ArrowRight } from 'lucide-react';
import { useQueues } from '../hooks/useQueues';
import ProgressBar from '../components/ProgressBar';
import QueueStatusBadge from '../components/QueueStatusBadge';
import Spinner from '../components/Spinner';

export default function HomePage() {
  const { queues, loading } = useQueues();
  const openQueues = queues.filter((q) => q.status === 'EnrollmentOpen');

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Open source · Built on Stellar
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
          Provably fair, non-transferable waiting lists
        </h1>
        <p className="mt-3 max-w-2xl text-base text-slate-600">
          LineProof moves queue fairness rules on-chain. Positions are identity-bound, scalping is prevented by protocol, and every transition is auditable by anyone.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/queues" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            Explore queues <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="https://github.com/lineproof/lineproof" target="_blank" rel="noreferrer"
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-300">
            View on GitHub
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-4 md:grid-cols-3">
        <FeatureCard icon={<ShieldCheck className="h-5 w-5" />} title="Non-transferable" description="Positions are bound to identities. Any transfer attempt is rejected and recorded on-chain." />
        <FeatureCard icon={<Users className="h-5 w-5" />} title="Duplicate prevention" description="One position per identity per queue, enforced at the contract level." />
        <FeatureCard icon={<Clock className="h-5 w-5" />} title="Auditable lifecycle" description="Every state change emits a structured on-chain event — readable by anyone." />
      </section>

      {/* Live queues */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Open queues</h2>
          <Link to="/queues" className="text-sm text-slate-500 hover:text-slate-900">See all →</Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner size="sm" /> Loading…</div>
        ) : openQueues.length === 0 ? (
          <p className="text-sm text-slate-500">No open queues right now.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {openQueues.slice(0, 4).map((q) => {
              const pct = q.maxPositions > 0 ? Math.round((q.enrolled / q.maxPositions) * 100) : 0;
              return (
                <Link key={q.id} to={`/queues/${q.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{q.name}</h3>
                    <QueueStatusBadge status={q.status as any} />
                  </div>
                  <ProgressBar value={pct} label={`${q.enrolled} / ${q.maxPositions}`} className="mt-3" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</div>
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}
