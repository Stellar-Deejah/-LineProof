type Status = 'Draft' | 'Open' | 'EnrollmentOpen' | 'EnrollmentClosed' | 'AdvancementActive' | 'Closed';

const STATUS_STYLES: Record<Status, string> = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  Open: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  EnrollmentOpen: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
  EnrollmentClosed: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  AdvancementActive: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  Closed: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
};

const STATUS_LABELS: Record<Status, string> = {
  Draft: 'Draft',
  Open: 'Open',
  EnrollmentOpen: 'Enrollment Open',
  EnrollmentClosed: 'Enrollment Closed',
  AdvancementActive: 'Advancing',
  Closed: 'Closed',
};

interface Props {
  status: Status;
  className?: string;
}

export default function QueueStatusBadge({ status, className = '' }: Props) {
  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.Closed;
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
