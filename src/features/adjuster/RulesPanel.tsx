import { CircleCheck, CircleX, Cpu, TriangleAlert, Zap } from 'lucide-react';
import type { CheckStatus, RulesResult } from '../../domain/types';
import { formatUSD } from '../../domain/rulesEngine';
import { ComplexityBadge, FastTrackBadge } from '../../components/badges';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Card, cx, Pill } from '../../components/ui';
import { DELAY_REASON_LABELS } from '../../domain/catalog';

const ICON: Record<CheckStatus, typeof CircleCheck> = { PASS: CircleCheck, WARN: TriangleAlert, FAIL: CircleX };
const COLOR: Record<CheckStatus, string> = { PASS: 'text-emerald-600', WARN: 'text-amber-500', FAIL: 'text-red-600' };

export function UncertaintyMeter({ score }: { score: number }) {
  const color = score < 15 ? 'bg-emerald-500' : score < 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">Uncertainty</span>
        <span className="font-semibold text-slate-900">{score}/100</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Uncertainty score">
        <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>Fast-track</span>
        <span>Review</span>
        <span>Investigate</span>
      </div>
    </div>
  );
}

export function RulesPanel({ rules, isHealth }: { rules: RulesResult; isHealth: boolean }) {
  const p = rules.payable;
  return (
    <Card title="Rules engine" icon={Cpu} actions={<span className="flex flex-wrap gap-2">{rules.fastTrackEligible && <FastTrackBadge />}<ComplexityBadge complexity={rules.complexity} /></span>}>
      <p className="mb-4 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">More uncertainty → more investigation and human review.</p>
      <UncertaintyMeter score={rules.uncertaintyScore} />

      {rules.triggers.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Manual review triggers</h3>
          <ul className="space-y-2">
            {rules.triggers.map((t, i) => (
              <li key={`${t.code}-${i}`} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-sm">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {t.label} <span className="text-xs font-normal text-slate-500">+{t.weight}</span>
                  </p>
                  <p className="text-slate-600">{t.explanation}</p>
                </div>
                <Pill tone="slate">{DELAY_REASON_LABELS[t.delayReason]}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-800">
          <Zap className="h-4 w-4" aria-hidden /> No review triggers. Low uncertainty.
        </p>
      )}

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Adjudication checks</h3>
      <ol className="space-y-2">
        {rules.checks.map((c, i) => {
          const Icon = ICON[c.status];
          return (
            <li key={c.id} className="flex items-start gap-2.5 text-sm">
              <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', COLOR[c.status])} aria-hidden />
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {i + 1}. {c.label} <span className={cx('ml-1 text-xs font-semibold', COLOR[c.status])}>{c.status}</span>
                </p>
                <p className="text-slate-600">{c.explanation}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Payable calculation</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <Row label={isHealth ? 'Billed' : 'Claimed / estimated'} value={formatUSD(p.claimed)} />
          {isHealth && <Row label="Allowed (fee schedule)" value={formatUSD(p.allowed)} />}
          {isHealth && p.contractualAdjustment > 0 && <Row label="Provider write-off" value={`− ${formatUSD(p.contractualAdjustment)}`} muted />}
          <Row label={<GlossaryTerm id="deductible" />} value={`− ${formatUSD(p.deductibleApplied)}`} muted />
          {isHealth && <Row label={<GlossaryTerm id="copay" />} value={`− ${formatUSD(p.copayApplied)}`} muted />}
          {isHealth && <Row label={<GlossaryTerm id="coinsurance" />} value={`− ${formatUSD(p.coinsuranceApplied)}`} muted />}
          {p.outOfPocketCapApplied > 0 && <Row label="Out-of-pocket max adjustment" value={`+ ${formatUSD(p.outOfPocketCapApplied)}`} muted />}
          {p.limitReduction > 0 && <Row label={`Above coverage limit (${formatUSD(p.coverageLimit ?? 0)})`} value={`− ${formatUSD(p.limitReduction)}`} muted />}
          <tr className="font-semibold">
            <td className="py-2">Payable by insurer</td>
            <td className="py-2 text-right text-emerald-700">{formatUSD(p.payable)}</td>
          </tr>
          <tr>
            <td className="py-2 text-slate-600">{isHealth ? 'Patient responsibility' : 'Claimant responsibility'}</td>
            <td className="py-2 text-right">{formatUSD(p.claimantResponsibility)}</td>
          </tr>
        </tbody>
      </table>
      {p.notes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Row({ label, value, muted }: { label: React.ReactNode; value: string; muted?: boolean }) {
  return (
    <tr>
      <td className={cx('py-1.5', muted ? 'pl-3 text-slate-600' : 'text-slate-800')}>{label}</td>
      <td className={cx('py-1.5 text-right', muted ? 'text-slate-600' : 'text-slate-900')}>{value}</td>
    </tr>
  );
}
