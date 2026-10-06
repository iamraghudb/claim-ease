import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Send } from 'lucide-react';
import { computeReadiness } from '../../domain/readiness';
import { evaluateClaim } from '../../domain/rulesEngine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { toDocInputs } from '../../components/Documents';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Alert, Button, cx, PageHeader } from '../../components/ui';
import { draftAmount, draftDetails, draftToClaimLike, emptyDraft, type IntakeDraft } from './draft';
import { PolicyStep } from './PolicyStep';
import { DetailsStep, validateDetails, type DetailErrors } from './DetailsStep';
import { DocumentsStep } from './DocumentsStep';
import { ReviewStep } from './ReviewStep';
import { ReadinessPanel } from './ReadinessPanel';
import { TipsPanel } from './TipsPanel';

const STEPS = ['Policy lookup', 'Incident details', 'Documents', 'Review & submit'];

export default function IntakeWizard() {
  const { role, actor, claims, config } = useAppStore();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<IntakeDraft>(() => emptyDraft(role));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const { run, pending } = useClaimAction();

  const claimLike = useMemo(() => draftToClaimLike(draft), [draft]);
  const readiness = useMemo(() => computeReadiness(claimLike), [claimLike]);
  const rules = useMemo(() => evaluateClaim(claimLike, draft.policy, { otherClaims: claims, config }), [claimLike, draft.policy, claims, config]);

  if (role === 'ADJUSTER' || role === 'ADMIN')
    return (
      <Alert tone="info" title="Switch role to file a claim">
        Use the role switcher in the header to act as a Claimant or Healthcare Provider.
      </Alert>
    );

  function next() {
    if (step === 1) {
      const e = validateDetails(draft);
      setErrors(e);
      if (Object.keys(e).length) {
        document.getElementById(Object.keys(e)[0] === 'vehicle' ? 'vmake' : Object.keys(e)[0])?.focus();
        return;
      }
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit() {
    const claim = await run(
      'submit',
      () =>
        claimService.create(
          {
            policyNumber: draft.policyNumber,
            claimType: draft.claimType,
            claimantName: claimLike.claimantName,
            dateOfLoss: draft.dateOfLoss,
            location: draft.location,
            incidentDescription: draft.incidentDescription.trim(),
            estimatedAmount: draftAmount(draft),
            estimatedFields: draft.estimatedFields,
            details: draftDetails(draft),
            documents: toDocInputs(draft.documents),
            tags: claimLike.tags,
          },
          actor,
        ),
      'Claim submitted',
    );
    if (claim) navigate(`/file/confirmation/${claim.claimNumber}`);
  }

  const canContinue = step === 0 ? !!draft.policy : true;

  return (
    <div>
      <PageHeader
        title={role === 'PROVIDER' ? 'Submit a health claim' : 'File a claim'}
        subtitle={
          <>
            <GlossaryTerm id="fnol">First notice of loss</GlossaryTerm> · takes about 5 minutes. Your progress is kept while you switch steps.
          </>
        }
      />

      <nav aria-label="Progress" className="mb-6">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                disabled={i > step && !(i === step + 1 && canContinue)}
                onClick={() => (i < step ? setStep(i) : i === step + 1 ? next() : undefined)}
                className="flex items-center gap-2 disabled:cursor-not-allowed"
                aria-current={i === step ? 'step' : undefined}
              >
                <span
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-white text-brand-700 ring-2 ring-brand-600' : 'bg-slate-200 text-slate-500',
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                </span>
                <span className={cx('hidden text-sm font-medium sm:inline', i === step ? 'text-slate-900' : 'text-slate-500')}>{s}</span>
              </button>
              {i < STEPS.length - 1 && <span className={cx('h-0.5 flex-1 rounded', i < step ? 'bg-brand-600' : 'bg-slate-200')} aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm font-medium text-slate-700 sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {/* Compact readiness on mobile so it's always visible */}
          {step > 0 && (
            <div className="mb-4 lg:hidden">
              <ReadinessPanel readiness={readiness} compact />
            </div>
          )}
          <div className="card p-4 sm:p-6">
            {step === 0 && <PolicyStep draft={draft} setDraft={setDraft} role={role} />}
            {step === 1 && <DetailsStep draft={draft} setDraft={setDraft} errors={errors} />}
            {step === 2 && <DocumentsStep draft={draft} setDraft={setDraft} />}
            {step === 3 && <ReviewStep draft={draft} goTo={setStep} rules={rules} confirmed={confirmed} setConfirmed={setConfirmed} />}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                Back
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={next} disabled={!canContinue}>
                  Continue <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button icon={Send} onClick={submit} disabled={!confirmed} loading={pending === 'submit'}>
                  Submit claim
                </Button>
              )}
            </div>
            {step === 0 && !draft.policy && <p className="mt-2 text-right text-xs text-slate-500">Look up a valid policy to continue.</p>}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Claim readiness and tips">
          <div className="hidden lg:block">
            <ReadinessPanel readiness={readiness} />
          </div>
          <TipsPanel defaultOpen={step === 0} />
        </aside>
      </div>
    </div>
  );
}
