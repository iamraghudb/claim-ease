import { useEffect, useState } from 'react';
import { Gavel } from 'lucide-react';
import { DENIAL_REASON_CODES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim, DecisionOutcome, RulesResult } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Alert, Button, Card, cx, Field } from '../../components/ui';

type Choice = DecisionOutcome | 'REQUEST_INFO';

const OPTIONS: { value: Choice; label: string; tone: string }[] = [
  { value: 'APPROVED', label: 'Approve', tone: 'peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-800' },
  { value: 'PARTIALLY_APPROVED', label: 'Partially approve', tone: 'peer-checked:border-lime-500 peer-checked:bg-lime-50 peer-checked:text-lime-800' },
  { value: 'DENIED', label: 'Deny', tone: 'peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-800' },
  { value: 'REQUEST_INFO', label: 'Request info', tone: 'peer-checked:border-amber-500 peer-checked:bg-amber-50 peer-checked:text-amber-800' },
];

export function AdjudicationPanel({ claim, rules, onRequestInfo }: { claim: Claim; rules: RulesResult; onRequestInfo: () => void }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const calculated = rules.payable.payable;
  const [choice, setChoice] = useState<Choice>(calculated > 0 ? 'APPROVED' : 'DENIED');
  const [amount, setAmount] = useState(String(calculated));
  const [overrideReason, setOverrideReason] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [explanation, setExplanation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => setAmount(String(calculated)), [calculated]);

  const enabled = claim.status === 'ADJUDICATION';
  const amountNum = Number(amount) || 0;
  const overridden = choice !== 'DENIED' && Math.abs(amountNum - calculated) >= 0.01;
  const expertRec = claim.expertInputs.filter((e) => e.recommendedAmount).at(-1);

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

  return (
    <Card title={<><GlossaryTerm id="adjudication">Adjudication</GlossaryTerm></>} icon={Gavel}>
      {!enabled && (
        <div className="mb-4">
          <Alert tone="info">
            Decisions can be recorded once the claim is in <strong>Adjudication</strong>.{' '}
            {rules.fastTrackEligible ? 'This claim is fast-track eligible: send it straight to adjudication.' : 'Resolve review triggers or move it to adjudication when ready.'}
          </Alert>
        </div>
      )}
      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Calculated payable</p>
            <p className="text-xl font-bold text-slate-900">{formatUSD(calculated)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{claim.claimType === 'HEALTH' ? 'Patient resp.' : 'Claimant resp.'}</p>
            <p className="text-xl font-bold text-slate-900">{formatUSD(rules.payable.claimantResponsibility)}</p>
          </div>
          {expertRec && (
            <div className="rounded-lg bg-violet-50 p-3">
              <p className="text-xs uppercase tracking-wide text-violet-700">Expert recommends (loss)</p>
              <p className="text-xl font-bold text-violet-900">{formatUSD(expertRec.recommendedAmount!)}</p>
              <p className="text-[11px] text-violet-700">{expertRec.expertName}</p>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="label">Decision</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OPTIONS.map((o) => (
              <label key={o.value} className="cursor-pointer">
                <input type="radio" name="decision" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="peer sr-only" />
                <span className={cx('block rounded-lg border-2 border-slate-200 px-3 py-2 text-center text-sm font-medium text-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500', o.tone)}>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {(choice === 'APPROVED' || choice === 'PARTIALLY_APPROVED') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Approved amount (override allowed)" htmlFor="approved" error={errors.amount} hint={overridden ? `Differs from calculated by ${formatUSD(amountNum - calculated)}` : 'Matches the calculated payable'}>
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
          <Field label={choice === 'DENIED' ? 'Explanation to claimant' : 'Explanation'} htmlFor="explanation" required error={errors.explanation} hint="Written in plain language. Shown to the claimant/provider.">
            <textarea id="explanation" rows={3} className="input" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
          </Field>
        ) : (
          <p className="text-sm text-slate-600">Pick the missing items in the next dialog. The claimant is notified and the SLA clock pauses.</p>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} loading={pending === 'decide'} variant={choice === 'DENIED' ? 'danger' : choice === 'REQUEST_INFO' ? 'secondary' : 'success'}>
            {choice === 'REQUEST_INFO' ? 'Choose items to request…' : 'Record decision'}
          </Button>
        </div>
      </fieldset>
    </Card>
  );
}
