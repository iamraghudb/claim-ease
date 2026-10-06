import { Pencil, Zap, Search } from 'lucide-react';
import { AUTO_INCIDENT_TYPES, CLAIM_TYPE_LABELS, DOCUMENT_CATEGORY_LABELS, findProcedure, PROPERTY_DAMAGE_TYPES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { RulesResult } from '../../domain/types';
import { formatDate } from '../../components/format';
import { Alert, Button, DescriptionList } from '../../components/ui';
import { draftAmount, type IntakeDraft } from './draft';

export function ReviewStep({ draft, goTo, rules, confirmed, setConfirmed }: {
  draft: IntakeDraft;
  goTo: (step: number) => void;
  rules: RulesResult;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}) {
  const est = (k: string) => (draft.estimatedFields.includes(k) ? <span className="ml-1 text-xs font-medium text-amber-700">(estimated)</span> : null);
  const Section = ({ title, step, children }: { title: string; step: number; children: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => goTo(step)} aria-label={`Edit ${title}`}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );

  const d = draft;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Review & submit</h2>
        <p className="text-sm text-slate-600">Check everything before you submit. You can add documents later, too.</p>
      </div>

      {rules.fastTrackEligible ? (
        <Alert tone="success" icon={Zap} title="Looks fast-track eligible">
          Based on what you’ve provided, this claim has low uncertainty and may be decided without further investigation.
        </Alert>
      ) : (
        <Alert tone="info" icon={Search} title="This claim will get a closer human review">
          More uncertainty means more investigation. Reasons: {rules.triggers.map((t) => t.label.toLowerCase()).join(', ') || 'amount above fast-track limit'}. Completing missing items can speed things up.
        </Alert>
      )}

      <Section title="Policy" step={0}>
        <DescriptionList
          cols={3}
          items={[
            { label: 'Policy', value: <span className="font-mono">{d.policyNumber}</span> },
            { label: 'Claim type', value: CLAIM_TYPE_LABELS[d.claimType] },
            { label: d.claimType === 'HEALTH' ? 'Date of service' : 'Date of loss', value: <>{formatDate(d.dateOfLoss)}{est('dateOfLoss')}</> },
          ]}
        />
      </Section>

      <Section title="Details" step={1}>
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
        <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{d.incidentDescription || 'No description provided.'}</p>
      </Section>

      <Section title={`Documents (${d.documents.length})`} step={2}>
        {d.documents.length ? (
          <ul className="flex flex-wrap gap-2">
            {d.documents.map((x) => (
              <li key={x.key} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {x.fileName} · {DOCUMENT_CATEGORY_LABELS[x.category]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No documents attached.</p>
        )}
      </Section>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I confirm this information is accurate and complete to the best of my knowledge. Values I marked as estimated are my best guess.
      </label>
    </div>
  );
}
