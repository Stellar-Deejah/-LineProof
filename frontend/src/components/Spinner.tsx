interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZE_MAP = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };

export default function Spinner({ size = 'md', className = '', label = 'Loading' }: Props) {
  return (
    <span role="status" className={`inline-flex ${className}`}>
      <svg
        className={`animate-spin text-slate-400 ${SIZE_MAP[size]}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
