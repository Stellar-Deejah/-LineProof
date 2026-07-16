type Status = 'Draft' | 'EnrollmentOpen' | 'EnrollmentClosed' | 'AdvancementActive' | 'Closed';

const STATUS_STYLES: Record<Status, string> = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  EnrollmentOpen: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EnrollmentClosed: 'bg-amber-50 text-amber-700 border-amber-200',
  AdvancementActive: 'bg-blue-50 text-blue-700 border-blue-200',
  Closed: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_LABELS: Record<Status, string> = {
  Draft: 'Draft',
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
