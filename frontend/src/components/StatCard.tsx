import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  className?: string;
}

export default function StatCard({ label, value, subtext, icon, className = '' }: Props) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 p-5 shadow-sm ${className}`}>
      {icon && <div className="mb-3 text-slate-400 dark:text-slate-500">{icon}</div>}
      <dl>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
        <dd className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{value}</dd>
        {subtext && <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtext}</dd>}
      </dl>
    </div>
  );
}
