import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Lightbulb, Send } from 'lucide-react';
import { computeReadiness } from '../../domain/readiness';
import { evaluateClaim } from '../../domain/rulesEngine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { useIntakeSeed } from '../../store/intakeSeed';
import { useCopilotPage } from '../copilot/pages';
import { toDocInputs } from '../../components/Documents';
import { Alert, Button, cx, PageHeader } from '../../components/ui';
import { buildDraftContext } from './aiDraftContext';
import { draftAmount, draftDetails, draftToClaimLike, emptyDraft, type IntakeDraft } from './draft';
import { PolicyStep } from './PolicyStep';
import { DetailsStep, validateDetails, type DetailErrors } from './DetailsStep';
import { DocumentsStep } from './DocumentsStep';
import { ReviewStep, STEP } from './ReviewStep';
import { ReadinessPanel } from './ReadinessPanel';

// Upload first, then confirm: the AI reads the documents and the details step arrives pre-filled.
const STEPS = ['Policy', 'Documents', 'Details', 'Review'];

const STEP_TIPS = [
  'Your policy number is on your insurance card or declarations page.',
  'Clear photos and the full bill help most. The AI reads them so you do not have to type.',
  'Not sure of a value? Tick "I\'m not sure". It is more honest than guessing, and a person will double-check it.',
  'A quick read-through now saves a follow-up question later.',
];

const STEP_SUMMARIES = [
  'Policy: the policy number and the date of loss or service, which are checked against the coverage period.',
  'Documents: uploading bills, estimates and photos. Ease can read them and offer to fill in the details.',
  'Details: what happened, with each value checked, and "I\'m not sure" boxes for anything uncertain.',
  'Review: a last look at everything, then the claim is submitted.',
];

export default function IntakeWizard() {
  const { role, actor, claims, config } = useAppStore();
  const navigate = useNavigate();
  // "Tell Ease what happened" hands over the claim it built. React StrictMode runs state initialisers twice, so they
  // only peek at the seed; it is cleared from an effect once the form has mounted.
  const [draft, setDraft] = useState<IntakeDraft>(() => useIntakeSeed.getState().draft ?? emptyDraft(role));
  const [step, setStep] = useState(() => (useIntakeSeed.getState().draft ? useIntakeSeed.getState().step : 0));
  useEffect(() => {
    useIntakeSeed.getState().clear();
  }, []);
  const [errors, setErrors] = useState<DetailErrors>({});
  const [confirmed, setConfirmed] = useState(false);
  const { run, pending } = useClaimAction();

  const claimLike = useMemo(() => draftToClaimLike(draft), [draft]);
  const readiness = useMemo(() => computeReadiness(claimLike), [claimLike]);
  const rules = useMemo(() => evaluateClaim(claimLike, draft.policy, { otherClaims: claims, config }), [claimLike, draft.policy, claims, config]);

  // Tell Ease which step the person is on and what the claim looks like (privacy-safe: see buildDraftContext).
  const staff = role === 'ADJUSTER' || role === 'ADMIN';
  const stepLabels = role === 'PROVIDER' ? ['Plan', ...STEPS.slice(1)] : STEPS;
  useCopilotPage(
    staff
      ? null
      : {
          path: '/file/form',
          title: `Claim form, step ${step + 1} of ${STEPS.length}: ${stepLabels[step]}`,
          summary: `The step-by-step claim form. The person is on step ${step + 1} of ${STEPS.length}, ${stepLabels[step]}. ${STEP_SUMMARIES[step]}`,
          data: buildDraftContext(draft, readiness, rules),
          suggestions: ['What documents do I need?', 'What does "I\'m not sure" do?', 'What happens after I submit?'],
        },
  );

  if (staff)
    return (
      <Alert tone="info" title="Switch persona to file a claim">
        Open the profile menu in the top right and choose the claimant or the healthcare provider.
      </Alert>
    );

  function next() {
    if (step === STEP.DETAILS) {
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
        subtitle="Takes about three minutes. Upload a bill and let the AI do the typing."
      />

      <nav aria-label="Progress" className="mb-8">
        <ol className="flex items-center">
          {stepLabels.map((s, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <li key={s} className={cx('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
                <button
                  type="button"
                  disabled={i > step && !(i === step + 1 && canContinue)}
                  onClick={() => (i < step ? setStep(i) : i === step + 1 ? next() : undefined)}
                  className="group flex items-center gap-2.5 disabled:cursor-not-allowed"
                  aria-current={current ? 'step' : undefined}
                >
                  <span
                    className={cx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition',
                      done && 'bg-brand-600 text-white shadow-sm',
                      current && 'bg-white text-brand-700 ring-[3px] ring-brand-500',
                      !done && !current && 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                  </span>
                  <span className={cx('hidden text-sm font-semibold sm:inline', current ? 'text-slate-900' : done ? 'text-slate-700' : 'text-slate-400')}>{s}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                    <span className="block h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: done ? '100%' : '0%' }} />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm font-semibold text-slate-700 sm:hidden">
          Step {step + 1} of {STEPS.length}: {stepLabels[step]}
        </p>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* Compact readiness on mobile so it's always visible */}
          {step > 0 && (
            <div className="mb-4 lg:hidden">
              <ReadinessPanel readiness={readiness} compact />
            </div>
          )}
          <div className="card p-5 sm:p-8">
            {step === STEP.POLICY && <PolicyStep draft={draft} setDraft={setDraft} role={role} />}
            {step === STEP.DOCUMENTS && <DocumentsStep draft={draft} setDraft={setDraft} />}
            {step === STEP.DETAILS && <DetailsStep draft={draft} setDraft={setDraft} errors={errors} />}
            {step === STEP.REVIEW && <ReviewStep draft={draft} goTo={setStep} rules={rules} readiness={readiness} confirmed={confirmed} setConfirmed={setConfirmed} />}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
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
            {step === 0 && !draft.policy && <p className="mt-2 text-right text-xs text-slate-500">Check a valid policy to continue.</p>}
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Claim readiness and tip">
          <div className="hidden lg:block">
            <ReadinessPanel readiness={readiness} />
          </div>
          <p className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-amber-950">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            <span>{STEP_TIPS[step]}</span>
          </p>
        </aside>
      </div>
    </div>
  );
}
