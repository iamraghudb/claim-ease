import { Check, Minus } from 'lucide-react';
import { getTimeline } from '../domain/statusMachine';
import type { Claim } from '../domain/types';
import { STATUS_LABELS, STATUS_DESCRIPTIONS } from '../domain/statusMachine';
import { formatDate } from './format';
import { cx } from './ui';

/** Visual claim lifecycle: completed, current and upcoming stages. */
export function Timeline({ claim }: { claim: Pick<Claim, 'status' | 'auditTrail'> }) {
  const stages = getTimeline(claim.status, claim.auditTrail);
  const sideTrack = claim.status === 'INFORMATION_REQUIRED' || claim.status === 'APPEALED' || claim.status === 'REOPENED';
  return (
    <div>
      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start" aria-label="Claim lifecycle">
        {stages.map((s, i) => {
          const isCurrent = s.state === 'current';
          return (
            <li key={s.key} className="relative flex flex-1 items-start gap-3 pb-4 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center" aria-current={isCurrent ? 'step' : undefined}>
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cx(
                    'absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 sm:left-[calc(50%+14px)] sm:top-[13px] sm:h-0.5 sm:w-[calc(100%-28px)]',
                    s.state === 'completed' || s.state === 'skipped' ? 'bg-brand-500' : 'bg-slate-200',
                  )}
                />
              )}
              <span
                className={cx(
                  'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  s.state === 'completed' && 'border-brand-600 bg-brand-600 text-white',
                  s.state === 'current' && 'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100',
                  s.state === 'upcoming' && 'border-slate-300 bg-white text-slate-400',
                  s.state === 'skipped' && 'border-slate-300 bg-slate-100 text-slate-400',
                )}
              >
                {s.state === 'completed' ? <Check className="h-4 w-4" aria-hidden /> : s.state === 'skipped' ? <Minus className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className={cx('text-sm font-medium', s.state === 'upcoming' || s.state === 'skipped' ? 'text-slate-400' : 'text-slate-900')}>
                  {s.label}
                  <span className="sr-only"> — {s.state}</span>
                </p>
                <p className="text-xs text-slate-500">{s.state === 'skipped' ? 'Not needed' : s.date && s.state !== 'upcoming' ? formatDate(s.date) : isCurrent ? 'In progress' : ''}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className={cx('mt-3 rounded-lg px-3 py-2 text-sm', sideTrack ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700')}>
        <strong>{STATUS_LABELS[claim.status]}:</strong> {STATUS_DESCRIPTIONS[claim.status]}
      </p>
    </div>
  );
}
