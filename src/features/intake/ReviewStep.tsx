import { useMemo } from 'react';
import { Pencil, Search, Zap } from 'lucide-react';
import { AUTO_INCIDENT_TYPES, CLAIM_TYPE_LABELS, DOCUMENT_CATEGORY_LABELS, findProcedure, PROPERTY_DAMAGE_TYPES } from '../../domain/catalog';
import type { ReadinessResult } from '../../domain/readiness';
import { formatUSD } from '../../domain/rulesEngine';
import type { RulesResult } from '../../domain/types';
import { formatDate } from '../../components/format';
import { Alert, Button, DescriptionList } from '../../components/ui';
import { AiGapCheck } from './AiGapCheck';
import { buildDraftContext } from './aiDraftContext';
import { draftAmount, type IntakeDraft } from './draft';

/** Wizard step indexes, so "Edit" jumps to the right place. Keep in sync with STEPS in IntakeWizard. */
export const STEP = { POLICY: 0, DOCUMENTS: 1, DETAILS: 2, REVIEW: 3 } as const;

export function ReviewStep({ draft, goTo, rules, readiness, confirmed, setConfirmed }: {
  draft: IntakeDraft;
  goTo: (step: number) => void;
  rules: RulesResult;
  readiness: ReadinessResult;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}) {
  const aiContext = useMemo(() => buildDraftContext(draft, readiness, rules), [draft, readiness, rules]);
  const est = (k: string) => (draft.estimatedFields.includes(k) ? <span className="ml-1.5 text-xs font-semibold text-amber-700">(not sure)</span> : null);
  const Section = ({ title, step, children }: { title: string; step: number; children: React.ReactNode }) => (
    <section className="rounded-2xl border border-slate-200 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => goTo(step)} aria-label={`Edit ${title}`}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );

  const d = draft;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Review and submit</h2>
        <p className="mt-1 text-sm text-slate-600">Take a last look. You can add documents later too.</p>
      </div>

      <AiGapCheck context={aiContext} />

      {rules.fastTrackEligible ? (
        <Alert tone="success" icon={Zap} title="Looks fast-track eligible">
          Based on what you&apos;ve provided, this claim has low uncertainty and may be decided without further investigation.
        </Alert>
      ) : (
        <Alert tone="info" icon={Search} title="A person will take a closer look">
          More uncertainty means more checking. Reasons: {rules.triggers.map((t) => t.label.toLowerCase()).join(', ') || 'the amount is above the fast-track limit'}. Filling in what&apos;s missing can speed things up.
        </Alert>
      )}

      <Section title="Policy" step={STEP.POLICY}>
        <DescriptionList
          cols={3}
          items={[
            { label: 'Policy', value: <span className="font-mono">{d.policyNumber}</span> },
            { label: 'Claim type', value: CLAIM_TYPE_LABELS[d.claimType] },
            { label: d.claimType === 'HEALTH' ? 'Date of service' : 'Date of loss', value: <>{formatDate(d.dateOfLoss)}{est('dateOfLoss')}</> },
          ]}
        />
      </Section>

      <Section title={`Documents (${d.documents.length})`} step={STEP.DOCUMENTS}>
        {d.documents.length ? (
          <ul className="flex flex-wrap gap-2">
            {d.documents.map((x) => (
              <li key={x.key} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {x.fileName} · {DOCUMENT_CATEGORY_LABELS[x.category]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No documents attached.</p>
        )}
      </Section>

      <Section title="Details" step={STEP.DETAILS}>
        <DescriptionList
          items={[
            ...(d.claimType === 'AUTO'
              ? [
                  { label: 'Incident', value: AUTO_INCIDENT_TYPES.find((t) => t.value === d.auto.incidentType)?.label },
                  { label: 'Vehicle', value: `${d.auto.vehicle.year ?? ''} ${d.auto.vehicle.make} ${d.auto.vehicle.model}` },
                  { label: 'Damage', value: <>{d.auto.vehicle.damage || '—'}{est('vehicleDamage')}</> },
                  { label: 'Drivable / injuries', value: `${d.auto.drivable ? 'Drivable' : 'Not drivable'} · ${d.auto.injuries ? 'Injuries reported' : 'No injuries'}` },
                  { label: 'Other parties', value: d.auto.otherParties.length ? d.auto.otherParties.map((p) => `${p.name} (at fault: ${p.atFault.toLowerCase()})`).join('; ') : 'None' },
                  { label: 'Police report #', value: d.auto.policeReportNumber || '—' },
                ]
              : d.claimType === 'PROPERTY'
                ? [
                    { label: 'Damage type', value: PROPERTY_DAMAGE_TYPES.find((t) => t.value === d.property.damageType)?.label },
                    { label: 'Address', value: d.property.propertyAddress },
                    { label: 'Areas affected', value: <>{d.property.areasAffected || '—'}{est('areasAffected')}</> },
                    { label: 'Livable', value: d.property.habitable ? 'Yes' : 'No' },
                  ]
                : [
                    { label: 'Patient', value: `${d.health.patientName} · ${d.health.memberId}` },
                    { label: 'Provider', value: `${d.health.provider.name} · NPI ${d.health.provider.npi}` },
                    {
                      label: 'Services',
                      value: d.health.lines.map((l) => `${l.procedureCode} ${findProcedure(l.procedureCode)?.description ?? ''} — ${formatUSD(l.billedAmount)}`).join('; '),
                    },
                  ]),
            { label: 'Location', value: `${d.location.city}, ${d.location.state}` },
            { label: d.claimType === 'HEALTH' ? 'Total billed' : 'Estimated amount', value: <>{formatUSD(draftAmount(d))}{est('estimatedAmount')}</> },
            { label: 'Catastrophe event', value: d.catastrophe ? 'Yes' : 'No' },
          ]}
        />
        <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{d.incidentDescription || 'No description provided.'}</p>
      </Section>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded accent-brand-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>I confirm this information is accurate and complete to the best of my knowledge. Anything I marked as &ldquo;not sure&rdquo; is my best guess.</span>
      </label>
    </div>
  );
}
