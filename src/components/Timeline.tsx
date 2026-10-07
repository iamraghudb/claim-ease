import { Check, Minus } from 'lucide-react';
import { getTimeline } from '../domain/statusMachine';
import type { Claim } from '../domain/types';
import { formatDate } from './format';
import { cx } from './ui';

/** Visual claim lifecycle: completed, current and upcoming stages. Horizontal on desktop, vertical on phones. */
export function Timeline({ claim }: { claim: Pick<Claim, 'status' | 'auditTrail'> }) {
  const stages = getTimeline(claim.status, claim.auditTrail);
  const sideTrack = claim.status === 'INFORMATION_REQUIRED' || claim.status === 'APPEALED' || claim.status === 'REOPENED';
  return (
    <ol className="flex flex-col sm:flex-row sm:items-start" aria-label="Claim lifecycle">
      {stages.map((s, i) => {
        const isCurrent = s.state === 'current';
        const done = s.state === 'completed' || s.state === 'skipped';
        return (
          <li key={s.key} className="relative flex flex-1 items-start gap-3 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2.5 sm:pb-0 sm:text-center" aria-current={isCurrent ? 'step' : undefined}>
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className={cx(
                  'absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded-full sm:left-[calc(50%+20px)] sm:top-[15px] sm:h-0.5 sm:w-[calc(100%-40px)]',
                  done ? 'bg-brand-500' : 'bg-slate-200',
                )}
              />
            )}
            <span
              className={cx(
                'relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition',
                s.state === 'completed' && 'bg-brand-600 text-white shadow-sm',
                s.state === 'current' && (sideTrack ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-white text-brand-700 ring-[3px] ring-brand-500'),
                s.state === 'upcoming' && 'bg-white text-slate-400 ring-2 ring-slate-200',
                s.state === 'skipped' && 'bg-slate-100 text-slate-400 ring-2 ring-slate-200',
              )}
            >
              {s.state === 'completed' ? <Check className="h-4 w-4" aria-hidden /> : s.state === 'skipped' ? <Minus className="h-4 w-4" aria-hidden /> : isCurrent ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" aria-hidden /> : i + 1}
            </span>
            <div className="min-w-0 pt-0.5 sm:pt-0">
              <p className={cx('text-sm font-semibold', s.state === 'upcoming' || s.state === 'skipped' ? 'text-slate-400' : isCurrent ? 'text-brand-800' : 'text-slate-900')}>
                {s.label}
                <span className="sr-only"> — {s.state}</span>
              </p>
              <p className="text-xs text-slate-500">{s.state === 'skipped' ? 'Not needed' : s.date && s.state !== 'upcoming' ? formatDate(s.date) : isCurrent ? 'In progress' : ''}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
