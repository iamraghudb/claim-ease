import { ArrowRight, Check, CircleCheck, CircleDashed, CircleHelp, CircleX, Hourglass, Info, Search, type LucideIcon } from 'lucide-react';
import type { BriefResult, StaffClaimContext } from '../../domain/aiTypes';
import type { ClaimStatus, DecisionOutcome, Role } from '../../domain/types';
import { aiService } from '../../services';
import { useAiResource } from '../../store/useAiResource';
import { useAiStatus } from '../../store/useAiStatus';
import { AiCard } from '../../components/ai';
import { Button, cx, Pill } from '../../components/ui';
import { ACTION_META, awaitsDecision, briefCta, type ActionTone } from './briefLogic';

const CHIP: Record<ActionTone, { icon: LucideIcon; classes: string }> = {
  approve: { icon: CircleCheck, classes: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  partial: { icon: CircleDashed, classes: 'bg-lime-50 text-lime-800 ring-lime-300' },
  deny: { icon: CircleX, classes: 'bg-red-50 text-red-800 ring-red-300' },
  info: { icon: CircleHelp, classes: 'bg-amber-50 text-amber-800 ring-amber-300' },
  look: { icon: Search, classes: 'bg-brand-50 text-brand-800 ring-brand-300' },
  wait: { icon: Hourglass, classes: 'bg-slate-100 text-slate-700 ring-slate-300' },
};

const SEVERITY: Record<BriefResult['risks'][number]['severity'], { tone: 'red' | 'amber' | 'slate'; label: string }> = {
  high: { tone: 'red', label: 'High' },
  medium: { tone: 'amber', label: 'Medium' },
  low: { tone: 'slate', label: 'Low' },
};

/**
 * Ease's brief on a claim: what it is, what Ease would do next and why, what stands out and what to double-check.
 * It appears by itself the first time a claim is opened (and is remembered), never blocks the screen, and only
 * ever suggests: the buttons open things the adjuster could already open.
 */
export function AiBrief({ context, claimStatus, role, onRequestInfo, onDecide }: {
  /** Build it once per change of claim (useMemo) so the remembered answer is found again. */
  context: StaffClaimContext;
  claimStatus: ClaimStatus;
  role: Role;
  onRequestInfo: () => void;
  /** Take the adjuster to the decision form with this choice marked. */
  onDecide: (choice: DecisionOutcome) => void;
}) {
  const status = useAiStatus();
  const { data, loading, error, refresh } = useAiResource('brief', context, () => aiService.brief(context));
  if (!status) return null;

  return (
    <div data-tour="ai-brief" className="no-print">
      <AiCard
        title="Ease's brief"
        source={data?.source}
        loading={loading}
        loadingSteps={['Ease is reading the claim…', 'Checking the rules findings…', 'Weighing what to do next…']}
        onRefresh={refresh}
      >
        {error && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600" role="alert">
            <span className="min-w-0">Ease could not read this claim just now. {error}</span>
            <Button size="sm" variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        )}
        {data && <BriefBody brief={data} claimStatus={claimStatus} role={role} onRequestInfo={onRequestInfo} onDecide={onDecide} />}
      </AiCard>
    </div>
  );
}

function BriefBody({ brief, claimStatus, role, onRequestInfo, onDecide }: { brief: BriefResult; claimStatus: ClaimStatus; role: Role; onRequestInfo: () => void; onDecide: (choice: DecisionOutcome) => void }) {
  return (
    <div className="rise space-y-4">
      <div>
        {brief.headline && <p className="text-lg font-bold leading-snug text-slate-900">{brief.headline}</p>}
        {brief.summary && <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{brief.summary}</p>}
      </div>

      {awaitsDecision(claimStatus) && <Suggestion recommended={brief.recommended} claimStatus={claimStatus} role={role} onRequestInfo={onRequestInfo} onDecide={onDecide} />}

      {brief.risks.length > 0 && (
        <section aria-labelledby="brief-risks">
          <h3 id="brief-risks" className="eyebrow mb-2">
            What stands out
          </h3>
          <ul className="space-y-2.5">
            {brief.risks.slice(0, 4).map((r, i) => {
              const sev = SEVERITY[r.severity];
              return (
                <li key={`${i}-${r.title}`} className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900">
                    {r.title}
                    <Pill tone={sev.tone}>
                      {sev.label}
                      <span className="sr-only"> risk</span>
                    </Pill>
                  </p>
                  {r.plain && <p className="mt-0.5 text-sm text-slate-600">{r.plain}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {brief.verify.length > 0 && (
        <section aria-labelledby="brief-verify">
          <h3 id="brief-verify" className="eyebrow mb-2">
            Worth double-checking
          </h3>
          <ul className="space-y-1.5">
            {brief.verify.slice(0, 3).map((v, i) => (
              <li key={`${i}-${v}`} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ai-100 text-ai-700">
                  <Check className="h-2.5 w-2.5" aria-hidden />
                </span>
                <span className="min-w-0">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-slate-500">A suggestion for you to weigh, not a decision.</p>
    </div>
  );
}

function Suggestion({ recommended, claimStatus, role, onRequestInfo, onDecide }: { recommended: BriefResult['recommended']; claimStatus: ClaimStatus; role: Role; onRequestInfo: () => void; onDecide: (choice: DecisionOutcome) => void }) {
  const meta = ACTION_META[recommended.action];
  const chip = CHIP[meta.tone];
  const cta = briefCta(recommended.action, claimStatus, role);
  return (
    <div className="rounded-xl bg-white p-3.5 shadow-sm ring-1 ring-ai-200">
      <p className="eyebrow text-ai-700">Ease suggests</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ring-1 ring-inset', chip.classes)}>
          <chip.icon className="h-4 w-4" aria-hidden />
          {meta.label}
        </span>
        {cta?.kind === 'request_info' && (
          <Button size="sm" variant="ai" icon={ArrowRight} onClick={onRequestInfo}>
            {cta.label}
          </Button>
        )}
        {cta?.kind === 'decide' && (
          <Button size="sm" variant="ai" icon={ArrowRight} onClick={() => onDecide(cta.choice)}>
            {cta.label}
          </Button>
        )}
      </div>
      {recommended.why && <p className="mt-2 text-sm leading-relaxed text-slate-700">{recommended.why}</p>}
      {cta?.kind === 'hint' && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {cta.text}
        </p>
      )}
    </div>
  );
}
