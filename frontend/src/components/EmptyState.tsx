import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-6 py-16 text-center">
      <Inbox className="h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <h2 className="mt-4 text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
