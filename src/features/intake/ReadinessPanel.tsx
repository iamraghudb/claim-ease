import { Check, CircleAlert, Lightbulb, TriangleAlert } from 'lucide-react';
import type { ReadinessResult } from '../../domain/readiness';
import { cx } from '../../components/ui';

export function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 90 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Claim readiness ${score} percent`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth="8" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 text-lg font-bold">
        {score}%
      </text>
    </svg>
  );
}

export function ReadinessPanel({ readiness, compact }: { readiness: ReadinessResult; compact?: boolean }) {
  const required = readiness.items.filter((i) => i.required);
  const recommended = readiness.items.filter((i) => !i.required);
  return (
    <section className="card p-4" aria-labelledby="readiness-title">
      <div className="flex items-center gap-4">
        <ScoreRing score={readiness.score} size={compact ? 64 : 88} />
        <div>
          <h2 id="readiness-title" className="text-sm font-semibold text-slate-900">
            Claim Readiness Score
          </h2>
          <p
            className={cx(
              'text-sm font-medium',
              readiness.label === 'Ready' ? 'text-emerald-700' : readiness.label === 'Almost there' ? 'text-amber-700' : 'text-red-700',
            )}
            aria-live="polite"
          >
            {readiness.label}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Complete claims are processed faster.</p>
        </div>
      </div>
      {!compact && (
        <>
          <ChecklistGroup title="Required" items={required} />
          {recommended.length > 0 && <ChecklistGroup title="Recommended" items={recommended} />}
          {readiness.estimated.length > 0 && (
            <p className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
              Values marked "estimated" are fine to submit. An adjuster will confirm them, which may take a little longer.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function ChecklistGroup({ title, items }: { title: string; items: ReadinessResult['items'] }) {
  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-sm">
            {i.satisfied && !i.estimated ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            ) : i.estimated ? (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            ) : (
              <CircleAlert className={cx('mt-0.5 h-4 w-4 shrink-0', i.required ? 'text-red-500' : 'text-slate-400')} aria-hidden />
            )}
            <span className={cx(i.satisfied && !i.estimated ? 'text-slate-500' : 'text-slate-800')}>
              {i.label}
              <span className="sr-only">{i.satisfied ? (i.estimated ? ' — provided, estimated' : ' — done') : ' — missing'}</span>
              {i.estimated && <span className="ml-1 text-xs text-amber-700">(estimated)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
