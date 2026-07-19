import type { ReactNode } from 'react';

interface LiveRegionProps {
  children: ReactNode;
  type?: 'error' | 'status';
  className?: string;
}

export default function LiveRegion({
  children,
  type = 'error',
  className,
}: LiveRegionProps) {
  const isError = type === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={className}
    >
      {children}
    </div>
  );
}
