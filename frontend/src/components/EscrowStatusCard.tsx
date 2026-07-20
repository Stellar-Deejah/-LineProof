import { useEffect } from 'react';
import { useEscrow, EscrowRecord } from '../hooks/useEscrow';
import { ShieldCheck, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import Spinner from './Spinner';

interface EscrowStatusCardProps {
  queueId: string;
  identity: string;
}

function StatusIcon({ status }: { status: EscrowRecord['status'] }) {
  switch (status) {
    case 'Active': return <ShieldCheck className="h-5 w-5 text-emerald-500" />;
    case 'Released': return <CheckCircle className="h-5 w-5 text-blue-500" />;
    case 'Refunded': return <CheckCircle className="h-5 w-5 text-slate-500" />;
    case 'Expired': return <AlertCircle className="h-5 w-5 text-red-500" />;
    default: return <ShieldCheck className="h-5 w-5 text-slate-400" />;
  }
}

export default function EscrowStatusCard({ queueId, identity }: EscrowStatusCardProps) {
  const { lookupForQueue, record, loading, error } = useEscrow();

  useEffect(() => {
    lookupForQueue(queueId, identity);
  }, [queueId, identity]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-500">No escrow record found or error loading.</p>
      </div>
    );
  }

  const expiryDate = new Date(record.expiresAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <StatusIcon status={record.status} />
          <h3 className="font-semibold text-slate-900">Escrow Status</h3>
        </div>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
          {record.status}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">Amount</p>
          <p className="text-sm font-semibold text-slate-900">
            {record.amount} {record.asset}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-slate-500 mb-1">
            <Clock className="h-3 w-3" /> Expires
          </p>
          <p className="text-sm text-slate-900">{expiryDate}</p>
        </div>
      </div>
    </div>
  );
}
