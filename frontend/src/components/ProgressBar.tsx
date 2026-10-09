import { useEffect, useRef } from 'react';

interface Props {
  value: number;   // 0–100
  label?: string;
  className?: string;
  ariaHidden?: boolean;
}

export default function ProgressBar({ value, label, className = '', ariaHidden }: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const fillRef = useRef<HTMLDivElement | null>(null);

  // Set the fill width via the CSSOM instead of an inline style attribute so the
  // app stays compatible with the strict CSP (style-src 'self', no 'unsafe-inline').
  useEffect(() => {
    if (fillRef.current) {
      fillRef.current.style.width = `${pct}%`;
    }
  }, [pct]);

  return (
    <div className={`space-y-1 ${className}`} aria-hidden={ariaHidden}>
      {label && (
        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          ref={fillRef}
          className="h-2 rounded-full bg-slate-800 dark:bg-slate-300 transition-all duration-500"
          role="progressbar"
          aria-label={label ?? 'Progress'}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}