import { FileClock, Lock } from 'lucide-react';
import type { AuditEntry } from '../domain/types';
import { STATUS_LABELS } from '../domain/statusMachine';
import { StatusBadge } from './badges';
import { formatDateTime } from './format';
import { Card } from './ui';

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <Card
      title="Activity"
      icon={FileClock}
      actions={
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Lock className="h-3 w-3" aria-hidden /> Cannot be edited
        </span>
      }
    >
      <ol className="relative space-y-5 border-l-2 border-slate-100 pl-6">
        {sorted.map((e) => (
          <li key={e.id} className="relative text-sm">
            <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900">{e.action}</span>
              {e.fromStatus && e.toStatus && (
                <span className="inline-flex items-center gap-1 text-xs" aria-label={`from ${STATUS_LABELS[e.fromStatus]} to ${STATUS_LABELS[e.toStatus]}`}>
                  <StatusBadge status={e.fromStatus} /> → <StatusBadge status={e.toStatus} />
                </span>
              )}
              {!e.fromStatus && e.toStatus && <StatusBadge status={e.toStatus} />}
            </div>
            <p className="text-xs text-slate-500">
              {formatDateTime(e.timestamp)} · {e.actor} ({e.role.toLowerCase()})
            </p>
            {e.details && <p className="mt-0.5 text-slate-600">{e.details}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
