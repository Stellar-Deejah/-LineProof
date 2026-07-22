import type { ReactNode } from 'react';
import { useId, useState } from 'react';

interface Props {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom';
}

export default function Tooltip({ content, children, position = 'top' }: Props) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  const posClass = position === 'top'
    ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
    : 'top-full mt-2 left-1/2 -translate-x-1/2';

  return (
    <span
      className="relative inline-flex"
      aria-describedby={tooltipId}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!visible}
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white shadow ${posClass}`}
      >
        {content}
      </span>
    </span>
  );
}
