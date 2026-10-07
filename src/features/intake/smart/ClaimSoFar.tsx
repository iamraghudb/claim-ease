import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  Calendar,
  Car,
  ChevronDown,
  CircleCheck,
  CircleDot,
  Droplets,
  FileText,
  Gauge,
  HeartPulse,
  House,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Paperclip,
  ShieldCheck,
  Siren,
  Stethoscope,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { POLICY_TYPE_LABELS } from '../../../domain/catalog';
import { computeReadiness } from '../../../domain/readiness';
import { formatDate } from '../../../components/format';
import { Button, cx, Pill } from '../../../components/ui';
import { draftToClaimLike, type IntakeDraft } from '../draft';
import { ScoreRing } from '../ReadinessPanel';
import { essentials, summaryRows, type SummaryRow } from './claimSummary';

const ICONS: Record<string, LucideIcon> = {
  dateOfLoss: Calendar,
  where: MapPin,
  description: MessageSquareText,
  vehicle: Car,
  vehicleDamage: Wrench,
  incidentType: Siren,
  drivable: Gauge,
  injuries: HeartPulse,
  hasOtherParty: User,
  policeReportNumber: FileText,
  damageType: Droplets,
  habitable: House,
  propertyAddress: MapPin,
  areasAffected: House,
  itemsStolenOrDamaged: FileText,
  patientName: User,
  providerName: Stethoscope,
  services: Stethoscope,
  estimatedAmount: Banknote,
  documents: Paperclip,
};

const LABEL_TONE = { Ready: 'text-emerald-700', 'Almost there': 'text-amber-700', 'Needs work': 'text-rose-700' } as const;

export interface ClaimSoFarProps {
  draft: IntakeDraft;
  /** Plain labels of what Ease still needs. */
  stillNeeded: string[];
  /** Everything Ease needs is in: offer "Review my claim". */
  ready: boolean;
  /** The policy is being checked right now. */
  verifying: boolean;
  onReview: () => void;
  onContinue: () => void;
}

/** One captured fact. It pops in when it first appears (and again when its value changes), not on first paint. */
function Row({ row, animate }: { row: SummaryRow; animate: boolean }) {
  const [pop] = useState(animate);
  const Icon = ICONS[row.key] ?? CircleDot;
  return (
    <div className={cx('flex items-start gap-3', pop && 'pop-in')}>
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ai-50 text-ai-600">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="eyebrow">{row.label}</dt>
        <dd className="mt-0.5 line-clamp-4 break-words text-sm font-medium text-slate-900">
          {row.value}
          {row.unsure && <span className="ml-1.5 text-xs font-semibold text-amber-700">(not sure)</span>}
        </dd>
      </div>
    </div>
  );
}

function PolicyRow({ draft, verifying, animate }: { draft: IntakeDraft; verifying: boolean; animate: boolean }) {
  const verified = !!draft.policy;
  const [pop] = useState(animate);
  return (
    <div className={cx('flex items-start gap-3', pop && 'pop-in')}>
      <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg', verified ? 'bg-emerald-50 text-emerald-600' : 'bg-ai-50 text-ai-600')}>
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <dt className="eyebrow">Policy</dt>
        <dd className="mt-0.5 text-sm font-medium text-slate-900">
          <span className="break-words">
            {draft.policy ? `${POLICY_TYPE_LABELS[draft.policy.type]} · ` : ''}
            <span className="font-mono text-[13px]">{draft.policyNumber}</span>
          </span>{' '}
          {verified ? (
            <Pill tone="green">
              <CircleCheck className="h-3 w-3" aria-hidden /> Verified
            </Pill>
          ) : (
            verifying && (
              <Pill tone="slate">
                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden /> Checking
              </Pill>
            )
          )}
          {verified && draft.dateOfLoss && <span className="mt-0.5 block text-xs font-normal text-slate-500">Active on {formatDate(draft.dateOfLoss)}</span>}
        </dd>
      </div>
    </div>
  );
}

/** "Your claim so far": everything captured, how complete it is, and what Ease still needs. Desktop sidebar. */
export function ClaimSoFar({ draft, stillNeeded, ready, verifying, onReview, onContinue }: ClaimSoFarProps) {
  const readiness = useMemo(() => computeReadiness(draftToClaimLike(draft)), [draft]);
  const rows = useMemo(() => summaryRows(draft), [draft]);
  // Rows that are there when the card first appears do not animate; the ones captured afterwards do.
  const [settled, setSettled] = useState(false);
  useEffect(() => setSettled(true), []);
  const empty = rows.length === 0 && !draft.policyNumber;

  return (
    <section className="card p-5" aria-labelledby="so-far-title">
      <div className="flex items-center gap-4">
        <ScoreRing score={readiness.score} size={64} />
        <div className="min-w-0">
          <h2 id="so-far-title" className="text-sm font-bold text-slate-900">
            Your claim so far
          </h2>
          <p className={cx('text-sm font-semibold', LABEL_TONE[readiness.label])} aria-live="polite">
            {readiness.label}
          </p>
        </div>
      </div>

      {empty ? (
        <p className="mt-5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">Nothing yet. As you tell me what happened, it shows up here.</p>
      ) : (
        <dl className="mt-5 space-y-3.5">
          {draft.policyNumber && <PolicyRow key={draft.policy ? 'verified' : 'unverified'} draft={draft} verifying={verifying} animate={settled} />}
          {rows.map((r) => (
            <Row key={`${r.key}:${r.value}`} row={r} animate={settled} />
          ))}
        </dl>
      )}

      {ready ? (
        <p className="pop-in mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden /> I have what I need.
        </p>
      ) : (
        stillNeeded.length > 0 && (
          <div className="mt-5">
            <h3 className="eyebrow mb-2">Still needed</h3>
            <ul className="flex flex-wrap gap-1.5">
              {stillNeeded.map((label) => (
                <li key={label} className="rounded-full border border-dashed border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      <div className="mt-5 space-y-2">
        {ready && (
          <Button className="w-full" onClick={onReview}>
            Review my claim <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
        <button type="button" onClick={onContinue} className="w-full rounded-lg py-1.5 text-center text-xs font-semibold text-slate-500 transition hover:text-slate-800">
          Continue in the form
        </button>
      </div>
    </section>
  );
}

/** The phone version: a one-line summary above the chat that opens into the full card. */
export function ClaimSoFarBar(props: ClaimSoFarProps) {
  const [open, setOpen] = useState(false);
  const readiness = useMemo(() => computeReadiness(draftToClaimLike(props.draft)), [props.draft]);
  const steps = useMemo(() => essentials(props.draft), [props.draft]);
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="mb-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="claim-so-far-panel"
        className="card flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:shadow-lift"
      >
        <ScoreRing score={readiness.score} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900">Your claim so far</span>
          <span className="block text-xs text-slate-500">
            {done} of {steps.length} details
          </span>
        </span>
        <ChevronDown className={cx('h-5 w-5 shrink-0 text-slate-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id="claim-so-far-panel" className="rise mt-2 max-h-[60vh] overflow-y-auto rounded-2xl">
          <ClaimSoFar {...props} />
        </div>
      )}
    </div>
  );
}
