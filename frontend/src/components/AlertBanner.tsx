import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react';

type Variant = 'info' | 'success' | 'warning' | 'error';

const STYLES: Record<Variant, { wrapper: string; icon: ReactNode }> = {
  info:    { wrapper: 'border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',         icon: <Info className="h-4 w-4 shrink-0" /> },
  success: { wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800', icon: <CheckCircle className="h-4 w-4 shrink-0" /> },
  warning: { wrapper: 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',      icon: <AlertTriangle className="h-4 w-4 shrink-0" /> },
  error:   { wrapper: 'border-red-200 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',            icon: <XCircle className="h-4 w-4 shrink-0" /> },
};

interface Props {
  variant?: Variant;
  message: string;
  onDismiss?: () => void;
}

export default function AlertBanner({ variant = 'info', message, onDismiss }: Props) {
  const { wrapper, icon } = STYLES[variant];
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${wrapper}`} role="alert">
      {icon}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          className="ml-auto shrink-0 opacity-60 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
