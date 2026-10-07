import { Check, CircleAlert, TriangleAlert } from 'lucide-react';
import type { ReadinessResult } from '../../domain/readiness';
import { cx } from '../../components/ui';

export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const stroke = size < 72 ? 7 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 90 ? '#059669' : score >= 60 ? '#d97706' : '#e11d48';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Claim readiness ${score} percent`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 500ms ease, stroke 300ms ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={cx('fill-slate-900 font-bold', size < 72 ? 'text-sm' : 'text-xl')}>
        {score}%
      </text>
    </svg>
  );
}

const LABEL_STYLE = { Ready: 'text-emerald-700', 'Almost there': 'text-amber-700', 'Needs work': 'text-rose-700' } as const;

/** How complete the claim is, and what is still needed. Shown beside every intake step. */
export function ReadinessPanel({ readiness, compact }: { readiness: ReadinessResult; compact?: boolean }) {
  const todo = readiness.items.filter((i) => !i.satisfied || i.estimated).sort((a, b) => Number(b.required) - Number(a.required));
  const done = readiness.items.filter((i) => i.satisfied && !i.estimated);
  return (
    <section className="card p-5" aria-labelledby="readiness-title">
      <div className="flex items-center gap-4">
        <ScoreRing score={readiness.score} size={compact ? 56 : 84} />
        <div>
          <h2 id="readiness-title" className="text-sm font-bold text-slate-900">
            Claim readiness
          </h2>
          <p className={cx('text-sm font-semibold', LABEL_STYLE[readiness.label])} aria-live="polite">
            {readiness.label}
          </p>
          {!compact && <p className="mt-0.5 text-xs text-slate-500">Complete claims are decided faster.</p>}
        </div>
      </div>

      {!compact && (
        <>
          {todo.length > 0 ? (
            <div className="mt-5">
              <h3 className="eyebrow mb-2">Still needed</h3>
              <ul className="space-y-2">
                {todo.map((i) => (
                  <li key={i.key} className="flex items-start gap-2.5 text-sm">
                    {i.estimated ? (
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                    ) : (
                      <CircleAlert className={cx('mt-0.5 h-4 w-4 shrink-0', i.required ? 'text-rose-500' : 'text-slate-300')} aria-hidden />
                    )}
                    <span className="text-slate-800">
                      {i.label}
                      {i.estimated ? <span className="ml-1.5 text-xs font-medium text-amber-700">(not sure)</span> : !i.required && <span className="ml-1.5 text-xs text-slate-400">optional</span>}
                      <span className="sr-only">{i.estimated ? ' — provided, not sure' : i.required ? ' — required, missing' : ' — optional, missing'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
              <Check className="h-4 w-4" aria-hidden /> Everything is in. You&apos;re good to go.
            </p>
          )}

          {done.length > 0 && (
            <details className="group mt-4">
              <summary className="cursor-pointer select-none text-xs font-semibold text-slate-500 hover:text-slate-800">Done ({done.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {done.map((i) => (
                  <li key={i.key} className="flex items-start gap-2.5 text-sm text-slate-500">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                    <span>
                      {i.label}
                      <span className="sr-only"> — done</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
