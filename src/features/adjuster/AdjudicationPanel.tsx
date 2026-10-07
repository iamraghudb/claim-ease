import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, CircleDashed, CircleHelp, CircleX, Gavel, Lock, Sparkles, type LucideIcon } from 'lucide-react';
import { DENIAL_REASON_CODES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim, DecisionOutcome, RulesResult } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Alert, Button, Card, cx, Field } from '../../components/ui';
import { AiDraftAssist } from './AiDraft';
import { decisionDraftRequest } from './draftContext';

type Choice = DecisionOutcome | 'REQUEST_INFO';

const OPTIONS: { value: Choice; label: string; icon: LucideIcon; tone: string }[] = [
  { value: 'APPROVED', label: 'Approve', icon: CircleCheck, tone: 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-800' },
  { value: 'PARTIALLY_APPROVED', label: 'Partially approve', icon: CircleDashed, tone: 'peer-checked:border-lime-500 peer-checked:bg-lime-50 peer-checked:text-lime-800' },
  { value: 'DENIED', label: 'Deny', icon: CircleX, tone: 'peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-800' },
  { value: 'REQUEST_INFO', label: 'Request info', icon: CircleHelp, tone: 'peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-800' },
];

/** A decision Ease's brief suggested. A new `nonce` means the adjuster asked to act on it again. */
export interface SuggestedChoice {
  choice: DecisionOutcome;
  nonce: number;
}

/**
 * The decision form. `embedded` renders it as a section for the claim's action card instead of a card of its own.
 * `suggested` pre-selects and marks the choice Ease's brief recommended. It never touches the amounts: the
 * calculated payable stays authoritative and the adjuster still records the decision.
 */
export function AdjudicationPanel({ claim, rules, onRequestInfo, embedded, suggested }: { claim: Claim; rules: RulesResult; onRequestInfo: () => void; embedded?: boolean; suggested?: SuggestedChoice }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const calculated = rules.payable.payable;
  const [choice, setChoice] = useState<Choice>(calculated > 0 ? 'APPROVED' : 'DENIED');
  const [amount, setAmount] = useState(String(calculated));
  const [overrideReason, setOverrideReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [explanation, setExplanation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<DecisionOutcome>();

  useEffect(() => setAmount(String(calculated)), [calculated]);
  useEffect(() => {
    if (!suggested) return;
    setChoice(suggested.choice);
    setMarked(suggested.choice);
  }, [suggested]);

  const enabled = claim.status === 'ADJUDICATION';
  const amountNum = Number(amount) || 0;
  const overridden = choice !== 'DENIED' && Math.abs(amountNum - calculated) >= 0.01;
  const expertRec = claim.expertInputs.filter((e) => e.recommendedAmount).at(-1);
  const outcome = choice === 'REQUEST_INFO' ? undefined : choice;

  async function submit() {
    if (choice === 'REQUEST_INFO') return onRequestInfo();
    const e: Record<string, string> = {};
    if (choice === 'DENIED') {
      if (!reasonCode) e.reasonCode = 'Select a denial reason code';
      if (explanation.trim().length < 10) e.explanation = 'Explain the denial in plain language (10+ characters)';
    } else {
      if (amountNum <= 0) e.amount = 'Amount must be greater than zero';
      if (overridden && !overrideReason.trim()) e.overrideReason = 'A reason is required when overriding the calculated amount';
      if (choice === 'PARTIALLY_APPROVED' && amountNum >= calculated) e.amount = `A partial approval should be less than the calculated ${formatUSD(calculated)}`;
      if (!explanation.trim()) e.explanation = 'Add a short explanation for the claimant';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    await run(
      'decide',
      () =>
        claimService.decide(
          claim.claimNumber,
          { outcome: choice, approvedAmount: choice === 'DENIED' ? 0 : amountNum, overrideReason: overridden ? overrideReason : undefined, denialReasonCode: reasonCode || undefined, explanation },
          actor,
        ),
      `Decision recorded: ${OPTIONS.find((o) => o.value === choice)?.label}`,
    );
  }

  const body = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/80">
          <p className="eyebrow">Calculated payable</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatUSD(calculated)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200/80">
          <p className="eyebrow">{claim.claimType === 'HEALTH' ? 'Patient pays' : 'Claimant pays'}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatUSD(rules.payable.claimantResponsibility)}</p>
        </div>
        {expertRec && (
          <div className="col-span-2 rounded-xl bg-brand-50 p-3 ring-1 ring-inset ring-brand-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Expert recommends (loss)</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xl font-bold tabular-nums text-brand-900">
              {formatUSD(expertRec.recommendedAmount!)}
              <span className="text-xs font-medium text-brand-700">{expertRec.expertName}</span>
            </p>
          </div>
        )}
      </div>

      {!enabled ? (
        <Alert tone="info" icon={Lock}>
          You can record a decision once the claim is in <GlossaryTerm id="adjudication">Adjudication</GlossaryTerm>.{' '}
          {rules.fastTrackEligible ? 'This claim is fast-track eligible, so you can send it straight there.' : 'Resolve the review triggers, then move it to adjudication.'}
        </Alert>
      ) : (
        <>
          <fieldset>
            <legend className="label">Your decision</legend>
            <div className={cx('grid grid-cols-2 gap-2', !embedded && 'sm:grid-cols-4')}>
              {OPTIONS.map((o) => (
                <label key={o.value} className="cursor-pointer">
                  <input type="radio" name="decision" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="peer sr-only" />
                  <span
                    className={cx(
                      'relative flex h-full flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-2.5 text-center text-xs font-semibold leading-tight text-slate-700 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2',
                      marked === o.value ? 'border-ai-400 bg-ai-50/70 ring-2 ring-ai-200' : 'border-slate-200 bg-white',
                      o.tone,
                    )}
                  >
                    {marked === o.value && (
                      <>
                        <Sparkles className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-ai-600" aria-hidden />
                        <span className="sr-only">(suggested by Ease) </span>
                      </>
                    )}
                    <o.icon className="h-5 w-5" aria-hidden />
                    {o.label}
                  </span>
                </label>
              ))}
            </div>
            {marked && (
              <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-ai-800">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-600" aria-hidden />
                Ease suggests: {OPTIONS.find((o) => o.value === marked)?.label}. The decision and the amount are still yours.
              </p>
            )}
          </fieldset>

          {(choice === 'APPROVED' || choice === 'PARTIALLY_APPROVED') && (
            <div className={cx('grid gap-4', !embedded && 'sm:grid-cols-2')}>
              <Field label="Approved amount" htmlFor="approved" error={errors.amount} hint={overridden ? `Differs from calculated by ${formatUSD(amountNum - calculated)}` : 'Matches the calculated payable. You can override it.'}>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
                  <input id="approved" type="number" min={0} step="0.01" className="input pl-7" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              </Field>
              <Field label="Override reason" htmlFor="override" required={overridden} error={errors.overrideReason}>
                <input id="override" className="input" disabled={!overridden} placeholder={overridden ? 'e.g. Pre-existing damage excluded per appraisal' : 'Not needed'} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </Field>
            </div>
          )}

          {choice === 'DENIED' && (
            <Field label="Denial reason code" htmlFor="reasonCode" required error={errors.reasonCode}>
              <select id="reasonCode" className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                <option value="">Select…</option>
                {DENIAL_REASON_CODES.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} — {d.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {choice !== 'REQUEST_INFO' ? (
            <Field label={choice === 'DENIED' ? 'Explanation to claimant' : 'Explanation'} htmlFor="explanation" required error={errors.explanation} hint="Write it in plain language. The claimant or provider will see this.">
              <textarea id="explanation" rows={3} className="input" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              {outcome && (
                <AiDraftAssist
                  key={`${outcome}|${reasonCode}`}
                  request={() => decisionDraftRequest({ claim, rules, outcome, approvedAmount: amountNum, reasonCode })}
                  current={explanation}
                  onUse={(text) => {
                    setExplanation(text);
                    setErrors((prev) => ({ ...prev, explanation: '' }));
                  }}
                />
              )}
            </Field>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">Pick the missing items in the next step. The claimant is notified and the SLA clock pauses.</p>
          )}

          <Button
            className="w-full"
            onClick={submit}
            icon={choice === 'REQUEST_INFO' ? undefined : Gavel}
            loading={pending === 'decide'}
            variant={choice === 'DENIED' ? 'danger' : choice === 'REQUEST_INFO' ? 'secondary' : 'success'}
          >
            {choice === 'REQUEST_INFO' ? 'Choose items to request' : 'Record decision'}
          </Button>
        </>
      )}
    </div>
  );

  if (embedded)
    return (
      <section aria-labelledby="decision-heading">
        <SectionTitle id="decision-heading" icon={Gavel}>
          Decision
        </SectionTitle>
        {body}
      </section>
    );
  return (
    <Card title="Decision" icon={Gavel}>
      {body}
    </Card>
  );
}

function SectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 id={id} className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-slate-900">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {children}
    </h3>
  );
}
