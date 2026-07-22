import { useEffect, useRef, useState } from 'react';
import { Copy, Check, X } from 'lucide-react';

interface Props {
  text: string;
  label?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

// Legacy fallback for contexts where the async Clipboard API is unavailable
// (non-HTTPS pages, some private-browsing modes and mobile browsers).
function execCommandCopy(value: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

export default function CopyButton({ text, label = 'Copy' }: Props) {
  const [state, setState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleClick = async () => {
    let succeeded = false;
    try {
      await navigator.clipboard.writeText(text);
      succeeded = true;
    } catch {
      succeeded = execCommandCopy(text);
    }
    setState(succeeded ? 'copied' : 'failed');
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState('idle'), 2000);
  };

  const feedback =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={feedback}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1 text-xs transition ${
        state === 'failed'
          ? 'border-red-300 text-red-600'
          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {state === 'copied' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      {state === 'failed' && <X className="h-3.5 w-3.5 text-red-600" />}
      {state === 'idle' && <Copy className="h-3.5 w-3.5" />}
      {feedback}
    </button>
  );
}
