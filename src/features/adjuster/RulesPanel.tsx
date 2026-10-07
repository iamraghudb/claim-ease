import type { ReactNode } from 'react';
import { Calculator, CircleCheck, CircleX, Info, ListChecks, TriangleAlert, Zap } from 'lucide-react';
import type { CheckStatus, RulesResult } from '../../domain/types';
import { formatUSD } from '../../domain/rulesEngine';
import { DELAY_REASON_LABELS } from '../../domain/catalog';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Card, cx, InfoTip, Pill } from '../../components/ui';

const CHECK_STYLES: Record<CheckStatus, { icon: typeof CircleCheck; tile: string; label: string; tone: 'green' | 'amber' | 'red' }> = {
  PASS: { icon: CircleCheck, tile: 'bg-emerald-50 text-emerald-600', label: 'Passed', tone: 'green' },
  WARN: { icon: TriangleAlert, tile: 'bg-amber-50 text-amber-600', label: 'Review', tone: 'amber' },
  FAIL: { icon: CircleX, tile: 'bg-red-50 text-red-600', label: 'Failed', tone: 'red' },
};

function uncertaintyBand(score: number) {
  if (score < 15) return { label: 'Low', bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (score < 45) return { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { label: 'High', bar: 'bg-red-500', text: 'text-red-700' };
}

/** 0 to 100 gauge. `compact` drops the heading and legend so it can sit inside a summary tile. */
export function UncertaintyMeter({ score, compact }: { score: number; compact?: boolean }) {
  const band = uncertaintyBand(score);
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        {compact ? (
          <span className={cx('font-semibold', band.text)}>{band.label}</span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-slate-600">
            Uncertainty
            <InfoTip label="About uncertainty">More uncertainty means more investigation and human review.</InfoTip>
          </span>
        )}
        <span className="font-semibold tabular-nums text-slate-900">
          {!compact && <span className={cx('mr-1.5', band.text)}>{band.label}</span>}
          {score}/100
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${band.label}, ${score} out of 100`} aria-label="Uncertainty score">
        <div className={cx('h-full rounded-full transition-all', band.bar)} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      {!compact && (
        <div className="mt-1.5 flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400">
          <span>Fast-track</span>
          <span>Review</span>
          <span>Investigate</span>
        </div>
      )}
    </div>
  );
}

/** The rules engine's verdict: what needs a human look, then every adjudication check as a pass / review / fail checklist. */
export function RulesPanel({ rules }: { rules: RulesResult }) {
  const counts = rules.checks.reduce<Record<CheckStatus, number>>((acc, c) => ({ ...acc, [c.status]: acc[c.status] + 1 }), { PASS: 0, WARN: 0, FAIL: 0 });
  return (
    <Card
      title="Rules engine checks"
      icon={ListChecks}
      actions={
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill tone="green">{counts.PASS} passed</Pill>
          {counts.WARN > 0 && <Pill tone="amber">{counts.WARN} to review</Pill>}
          {counts.FAIL > 0 && <Pill tone="red">{counts.FAIL} failed</Pill>}
        </span>
      }
    >
      <h3 className="eyebrow mb-2.5">Needs a human look</h3>
      {rules.triggers.length > 0 ? (
        <ul className="space-y-2">
          {rules.triggers.map((t, i) => (
            <li key={`${t.code}-${i}`} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{t.label}</p>
                <p className="mt-0.5 text-slate-600">{t.explanation}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <Pill tone="slate">{DELAY_REASON_LABELS[t.delayReason]}</Pill>
                  <span className="text-[11px] font-medium tabular-nums text-amber-700" title={`Adds ${t.weight} to the uncertainty score`}>
                    +{t.weight} risk
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-sm font-medium text-emerald-800">
          <Zap className="h-4 w-4 shrink-0" aria-hidden /> Nothing to flag. Uncertainty is low.
        </p>
      )}

      <h3 className="eyebrow mb-1 mt-6">Adjudication checks</h3>
      <ol className="divide-y divide-slate-100">
        {rules.checks.map((c) => {
          const s = CHECK_STYLES[c.status];
          const Icon = s.icon;
          return (
            <li key={c.id} className="flex items-start gap-3 py-3">
              <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full', s.tile)}>
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900">
                  {c.label}
                  <span className="sm:hidden">
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{c.explanation}</p>
              </div>
              <span className="hidden shrink-0 sm:block">
                <Pill tone={s.tone}>{s.label}</Pill>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** How the payable amount is reached, laid out like a receipt. */
export function PayableCard({ rules, isHealth }: { rules: RulesResult; isHealth: boolean }) {
  const p = rules.payable;
  return (
    <Card title="Payable calculation" icon={Calculator}>
      <table className="w-full text-sm">
        <caption className="sr-only">How the payable amount is calculated</caption>
        <tbody className="divide-y divide-slate-100">
          <Row label={isHealth ? 'Billed' : 'Claimed / estimated'} value={formatUSD(p.claimed)} />
          {isHealth && <Row label="Allowed (fee schedule)" value={formatUSD(p.allowed)} />}
          {isHealth && p.contractualAdjustment > 0 && <Row label="Provider write-off" value={`− ${formatUSD(p.contractualAdjustment)}`} muted />}
          <Row label={<GlossaryTerm id="deductible" />} value={`− ${formatUSD(p.deductibleApplied)}`} muted />
          {isHealth && <Row label={<GlossaryTerm id="copay" />} value={`− ${formatUSD(p.copayApplied)}`} muted />}
          {isHealth && <Row label={<GlossaryTerm id="coinsurance" />} value={`− ${formatUSD(p.coinsuranceApplied)}`} muted />}
          {p.outOfPocketCapApplied > 0 && <Row label="Out-of-pocket max adjustment" value={`+ ${formatUSD(p.outOfPocketCapApplied)}`} muted />}
          {p.limitReduction > 0 && <Row label={`Above coverage limit (${formatUSD(p.coverageLimit ?? 0)})`} value={`− ${formatUSD(p.limitReduction)}`} muted />}
        </tbody>
      </table>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Payable by insurer</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-800">{formatUSD(p.payable)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
          <p className="eyebrow">{isHealth ? 'Patient responsibility' : 'Claimant responsibility'}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{formatUSD(p.claimantResponsibility)}</p>
        </div>
      </div>

      {p.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
          {p.notes.map((n) => (
            <li key={n} className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Row({ label, value, muted }: { label: ReactNode; value: string; muted?: boolean }) {
  return (
    <tr>
      <td className={cx('py-2', muted ? 'pl-4 text-slate-600' : 'font-medium text-slate-800')}>{label}</td>
      <td className={cx('py-2 text-right tabular-nums', muted ? 'text-slate-600' : 'font-semibold text-slate-900')}>{value}</td>
    </tr>
  );
}
