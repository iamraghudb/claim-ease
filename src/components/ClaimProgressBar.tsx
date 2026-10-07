import { claimProgressPercent } from '../domain/progress';
import type { Claim } from '../domain/types';
import { cx } from './ui';

/** A slim progress bar for list rows. */
export function ClaimProgressBar({ claim, className }: { claim: Pick<Claim, 'status' | 'auditTrail'>; className?: string }) {
  const pct = claimProgressPercent(claim);
  const attention = claim.status === 'INFORMATION_REQUIRED';
  return (
    <div className={cx('flex items-center gap-2', className)} role="img" aria-label={`${pct}% of the way through`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full transition-all', attention ? 'bg-amber-400' : 'bg-gradient-to-r from-brand-400 to-brand-600')} style={{ width: `${Math.max(pct, 6)}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] font-semibold tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}
