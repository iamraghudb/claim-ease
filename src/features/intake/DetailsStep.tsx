import { Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  AUTO_INCIDENT_TYPES,
  DIAGNOSES,
  HEALTH_SERVICE_TYPES,
  PLACES_OF_SERVICE,
  PROCEDURES,
  PROPERTY_DAMAGE_TYPES,
  US_STATES,
} from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { AutoDetails, HealthDetails, OtherParty, PropertyDetails } from '../../domain/types';
import { Button, EstimatedToggle, Field, Pill } from '../../components/ui';
import { draftAmount, toggleEstimated, type IntakeDraft } from './draft';
import { templateLines, VISIT_TEMPLATES } from '../provider/practice';

export type DetailErrors = Partial<Record<string, string>>;

export function validateDetails(d: IntakeDraft): DetailErrors {
  const e: DetailErrors = {};
  if (!d.location.city.trim()) e.city = 'City is required';
  if (!d.location.state) e.state = 'State is required';
  if (d.incidentDescription.trim().length < 20) e.incidentDescription = 'Please describe what happened in at least 20 characters';
  if (d.claimType !== 'HEALTH' && !(Number(d.estimatedAmount) > 0)) e.estimatedAmount = 'Enter your best estimate. Tick “I’m not sure” if you can’t give an exact figure';
  if (d.claimType === 'AUTO') {
    if (!d.auto.vehicle.make || !d.auto.vehicle.model) e.vehicle = 'Vehicle make and model are required';
    d.auto.otherParties.forEach((p, i) => {
      if (!p.name.trim()) e[`party${i}`] = 'Name is required (use “Unknown” if a hit and run)';
    });
  }
  if (d.claimType === 'PROPERTY' && !d.property.propertyAddress.trim()) e.propertyAddress = 'Property address is required';
  if (d.claimType === 'HEALTH') {
    if (!d.health.memberId) e.memberId = 'Select the patient / member';
    if (!/^\d{10}$/.test(d.health.provider.npi)) e.npi = 'NPI must be 10 digits';
    d.health.lines.forEach((l, i) => {
      if (!l.procedureCode || !l.diagnosisCode || !(l.billedAmount > 0)) e[`line${i}`] = 'Procedure, diagnosis and billed amount are required';
    });
  }
  return e;
}

type Props = { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void; errors: DetailErrors };

export function DetailsStep({ draft, setDraft, errors }: Props) {
  const isHealth = draft.claimType === 'HEALTH';
  const est = (k: string) => draft.estimatedFields.includes(k);
  const filled = draft.scan?.appliedLabels ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{isHealth ? 'Check the patient and service details' : 'Check what happened'}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {filled.length > 0
            ? 'Review what we filled in and complete anything that is left.'
            : isHealth
              ? 'The patient, the provider and each service on the bill.'
              : 'Tell us in your own words. If you are not sure of a value, tick "I\'m not sure" instead of guessing.'}
        </p>
      </div>

      {filled.length > 0 && (
        <div className="ai-surface flex items-start gap-3 p-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ai-600 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              AI filled in {filled.length} item{filled.length === 1 ? '' : 's'} {draft.scan?.documents.length ? 'from your documents' : 'from what you told Ease'}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {filled.map((l) => (
                <Pill key={l} tone="purple">
                  {l}
                </Pill>
              ))}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">Please check them below and change anything that is not right.</p>
          </div>
        </div>
      )}

      {draft.claimType === 'AUTO' && <AutoFields draft={draft} setDraft={setDraft} errors={errors} />}
      {draft.claimType === 'PROPERTY' && <PropertyFields draft={draft} setDraft={setDraft} errors={errors} />}
      {isHealth && <HealthFields draft={draft} setDraft={setDraft} errors={errors} />}

      <fieldset className="grid gap-4 pt-2 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold text-slate-900">{isHealth ? 'Clinical summary & location' : 'Description & amount'}</legend>
        <div className="sm:col-span-2">
          <Field label={isHealth ? 'Clinical summary' : 'Description of what happened'} htmlFor="desc" required error={errors.incidentDescription}>
            <textarea
              id="desc"
              rows={4}
              className="input"
              placeholder={isHealth ? 'Reason for visit, findings, and services rendered' : 'Where were you, what happened, and what was damaged?'}
              value={draft.incidentDescription}
              onChange={(e) => setDraft({ ...draft, incidentDescription: e.target.value })}
            />
          </Field>
          <p className="mt-1 text-right text-xs text-slate-400">{draft.incidentDescription.length} characters</p>
        </div>
        <Field label="City" htmlFor="city" required error={errors.city}>
          <input id="city" className="input" autoComplete="address-level2" value={draft.location.city} onChange={(e) => setDraft({ ...draft, location: { ...draft.location, city: e.target.value } })} />
        </Field>
        <Field label="State" htmlFor="state" required error={errors.state}>
          <select id="state" className="input" value={draft.location.state} onChange={(e) => setDraft({ ...draft, location: { ...draft.location, state: e.target.value } })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        {isHealth ? (
          <div className="sm:col-span-2 rounded-xl bg-slate-50 p-4 text-sm">
            Total billed: <strong>{formatUSD(draftAmount(draft))}</strong> <span className="text-slate-500">(sum of service lines)</span>
          </div>
        ) : (
          <div>
            <Field label="Estimated amount of loss (USD)" htmlFor="amount" required error={errors.estimatedAmount} hint="Repair estimate or replacement cost">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">$</span>
                <input id="amount" type="number" inputMode="decimal" min={0} step="0.01" className="input pl-7" value={draft.estimatedAmount} onChange={(e) => setDraft({ ...draft, estimatedAmount: e.target.value })} />
              </div>
            </Field>
            <EstimatedToggle checked={est('estimatedAmount')} onChange={(v) => setDraft(toggleEstimated(draft, 'estimatedAmount', v))} />
          </div>
        )}
        {!isHealth && (
          <label className="flex items-start gap-2 self-center text-sm text-slate-700 sm:col-span-1">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-brand-600" checked={draft.catastrophe} onChange={(e) => setDraft({ ...draft, catastrophe: e.target.checked })} />
            Related to a named storm or declared disaster (storm or disaster)
          </label>
        )}
      </fieldset>
    </div>
  );
}

function YesNo({ label, value, onChange, name }: { label: string; value: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <label key={String(v)} className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${value === v ? 'border-brand-500 bg-brand-50 font-medium text-brand-800' : 'border-slate-300 bg-white'}`}>
            <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {v ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AutoFields({ draft, setDraft, errors }: Props) {
  const a = draft.auto;
  const set = (patch: Partial<AutoDetails>) => setDraft({ ...draft, auto: { ...a, ...patch } });
  const setParty = (i: number, patch: Partial<OtherParty>) => set({ otherParties: a.otherParties.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const est = (k: string) => draft.estimatedFields.includes(k);
  return (
    <>
      <fieldset className="grid gap-4 pt-2 sm:grid-cols-2">
        <legend className="mb-3 text-base font-bold text-slate-900">Accident details</legend>
        <div className="sm:col-span-2">
          <Field label="Type of incident" htmlFor="incidentType" required>
            <select id="incidentType" className="input" value={a.incidentType} onChange={(e) => set({ incidentType: e.target.value as AutoDetails['incidentType'] })}>
              {AUTO_INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <YesNo name="drivable" label="Is the vehicle drivable?" value={a.drivable} onChange={(v) => set({ drivable: v })} />
        <YesNo name="injuries" label="Was anyone injured?" value={a.injuries} onChange={(v) => set({ injuries: v })} />
        <div>
          <Field label="Police report number" htmlFor="police" hint="Required for multi-vehicle accidents, theft, and hit and run">
            <input id="police" className="input" value={a.policeReportNumber ?? ''} onChange={(e) => set({ policeReportNumber: e.target.value })} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 pt-2 sm:grid-cols-4">
        <legend className="mb-3 text-base font-bold text-slate-900">Your vehicle</legend>
        <Field label="Year" htmlFor="vyear">
          <input id="vyear" type="number" className="input" value={a.vehicle.year ?? ''} onChange={(e) => set({ vehicle: { ...a.vehicle, year: Number(e.target.value) || undefined } })} />
        </Field>
        <Field label="Make" htmlFor="vmake" required error={errors.vehicle}>
          <input id="vmake" className="input" value={a.vehicle.make} onChange={(e) => set({ vehicle: { ...a.vehicle, make: e.target.value } })} />
        </Field>
        <Field label="Model" htmlFor="vmodel" required>
          <input id="vmodel" className="input" value={a.vehicle.model} onChange={(e) => set({ vehicle: { ...a.vehicle, model: e.target.value } })} />
        </Field>
        <Field label="VIN" htmlFor="vvin">
          <input id="vvin" className="input font-mono text-xs" value={a.vehicle.vin ?? ''} onChange={(e) => set({ vehicle: { ...a.vehicle, vin: e.target.value } })} />
        </Field>
        <div className="sm:col-span-4">
          <Field label="Damage to your vehicle" htmlFor="vdamage" required>
            <input id="vdamage" className="input" placeholder="e.g. Rear bumper, trunk lid, tail light" value={a.vehicle.damage} onChange={(e) => set({ vehicle: { ...a.vehicle, damage: e.target.value } })} />
          </Field>
          <EstimatedToggle checked={est('vehicleDamage')} onChange={(v) => setDraft(toggleEstimated({ ...draft }, 'vehicleDamage', v))} />
        </div>
      </fieldset>

      <fieldset className="pt-2">
        <legend className="mb-3 text-base font-bold text-slate-900">Other parties involved</legend>
        {a.otherParties.length === 0 && <p className="mb-2 text-sm text-slate-500">No other vehicles or people involved.</p>}
        <div className="space-y-3">
          {a.otherParties.map((p, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
              <Field label="Name" htmlFor={`pname${i}`} required error={errors[`party${i}`]}>
                <input id={`pname${i}`} className="input" value={p.name} onChange={(e) => setParty(i, { name: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor={`pphone${i}`}>
                <input id={`pphone${i}`} type="tel" className="input" value={p.phone ?? ''} onChange={(e) => setParty(i, { phone: e.target.value })} />
              </Field>
              <Field label="Their insurer" htmlFor={`pins${i}`}>
                <input id={`pins${i}`} className="input" value={p.insurer ?? ''} onChange={(e) => setParty(i, { insurer: e.target.value })} />
              </Field>
              <Field label="Their policy #" htmlFor={`ppol${i}`}>
                <input id={`ppol${i}`} className="input" value={p.policyNumber ?? ''} onChange={(e) => setParty(i, { policyNumber: e.target.value })} />
              </Field>
              <Field label="Their vehicle" htmlFor={`pveh${i}`}>
                <input id={`pveh${i}`} className="input" value={p.vehicle ?? ''} onChange={(e) => setParty(i, { vehicle: e.target.value })} />
              </Field>
              <Field label="Was this party at fault?" htmlFor={`pfault${i}`} hint={p.atFault === 'UNKNOWN' ? 'Unknown liability means we will investigate' : undefined}>
                <select id={`pfault${i}`} className="input" value={p.atFault} onChange={(e) => setParty(i, { atFault: e.target.value as OtherParty['atFault'] })}>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="UNKNOWN">Unknown / not sure</option>
                </select>
              </Field>
              <div className="sm:col-span-3">
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => set({ otherParties: a.otherParties.filter((_, j) => j !== i) })}>
                  Remove party
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon={Plus} className="mt-3" onClick={() => set({ otherParties: [...a.otherParties, { name: '', atFault: 'UNKNOWN' }] })}>
          Add other party
        </Button>
      </fieldset>
    </>
  );
}

function PropertyFields({ draft, setDraft, errors }: Props) {
  const p = draft.property;
  const set = (patch: Partial<PropertyDetails>) => setDraft({ ...draft, property: { ...p, ...patch } });
  const est = (k: string) => draft.estimatedFields.includes(k);
  const theft = p.damageType === 'THEFT' || p.damageType === 'VANDALISM';
  return (
    <fieldset className="grid gap-4 pt-2 sm:grid-cols-2">
      <legend className="mb-3 text-base font-bold text-slate-900">Damage details</legend>
      <Field label="Type of damage" htmlFor="damageType" required>
        <select id="damageType" className="input" value={p.damageType} onChange={(e) => set({ damageType: e.target.value as PropertyDetails['damageType'] })}>
          {PROPERTY_DAMAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <YesNo name="habitable" label="Is the home livable right now?" value={p.habitable} onChange={(v) => set({ habitable: v })} />
      <div className="sm:col-span-2">
        <Field label="Property address" htmlFor="paddr" required error={errors.propertyAddress}>
          <input id="paddr" className="input" autoComplete="street-address" value={p.propertyAddress} onChange={(e) => set({ propertyAddress: e.target.value })} />
        </Field>
      </div>
      <div>
        <Field label="Rooms / areas affected" htmlFor="areas" required>
          <input id="areas" className="input" placeholder="e.g. Kitchen, hallway" value={p.areasAffected} onChange={(e) => set({ areasAffected: e.target.value })} />
        </Field>
        <EstimatedToggle checked={est('areasAffected')} onChange={(v) => setDraft(toggleEstimated(draft, 'areasAffected', v))} />
      </div>
      {theft ? (
        <div>
          <Field label="Items stolen or damaged" htmlFor="items" required>
            <textarea id="items" rows={2} className="input" placeholder="Item, approx. age, value" value={p.itemsStolenOrDamaged ?? ''} onChange={(e) => set({ itemsStolenOrDamaged: e.target.value })} />
          </Field>
          <EstimatedToggle checked={est('itemsStolenOrDamaged')} onChange={(v) => setDraft(toggleEstimated(draft, 'itemsStolenOrDamaged', v))} />
        </div>
      ) : (
        <Field label="Contractor name (if any)" htmlFor="contractor" hint="Who provided or will provide the repair estimate">
          <input id="contractor" className="input" value={p.contractorName ?? ''} onChange={(e) => set({ contractorName: e.target.value })} />
        </Field>
      )}
      {!p.habitable && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 sm:col-span-2">
          If your home is unlivable, keep receipts for hotels and meals. Many policies include <strong>Loss of Use</strong> coverage. Your claim will be prioritized.
        </p>
      )}
    </fieldset>
  );
}

function HealthFields({ draft, setDraft, errors }: Props) {
  const h = draft.health;
  const set = (patch: Partial<HealthDetails>) => setDraft({ ...draft, health: { ...h, ...patch } });
  const members = draft.policy?.members ?? [];
  const setLine = (i: number, patch: Partial<HealthDetails['lines'][number]>) => set({ lines: h.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <>
      <fieldset className="grid gap-4 pt-2 sm:grid-cols-3">
        <legend className="mb-3 text-base font-bold text-slate-900">Patient / member</legend>
        <Field label="Member" htmlFor="member" required error={errors.memberId}>
          <select
            id="member"
            className="input"
            value={h.memberId}
            onChange={(e) => {
              const m = members.find((x) => x.memberId === e.target.value);
              set({ memberId: e.target.value, patientName: m?.name ?? '', patientDob: m?.dob ?? '' });
            }}
          >
            <option value="">Select member…</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.memberId} · {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Patient name" htmlFor="pname">
          <input id="pname" className="input" value={h.patientName} onChange={(e) => set({ patientName: e.target.value })} />
        </Field>
        <Field label="Date of birth" htmlFor="pdob">
          <input id="pdob" type="date" className="input" value={h.patientDob} onChange={(e) => set({ patientDob: e.target.value })} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 pt-2 sm:grid-cols-3">
        <legend className="mb-3 text-base font-bold text-slate-900">Rendering provider</legend>
        <Field label="Provider / practice" htmlFor="prov">
          <input id="prov" className="input" value={h.provider.name} onChange={(e) => set({ provider: { ...h.provider, name: e.target.value } })} />
        </Field>
        <Field label="NPI" htmlFor="npi" required error={errors.npi} hint="10-digit National Provider Identifier">
          <input id="npi" inputMode="numeric" className="input font-mono" value={h.provider.npi} onChange={(e) => set({ provider: { ...h.provider, npi: e.target.value.replace(/\D/g, '').slice(0, 10) } })} />
        </Field>
        <Field label="Tax ID" htmlFor="tin">
          <input id="tin" className="input font-mono" value={h.provider.taxId} onChange={(e) => set({ provider: { ...h.provider, taxId: e.target.value } })} />
        </Field>
        <Field label="Claim type (decision window)" htmlFor="svcType">
          <select id="svcType" className="input" value={h.serviceType} onChange={(e) => set({ serviceType: e.target.value as HealthDetails['serviceType'] })}>
            {HEALTH_SERVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{HEALTH_SERVICE_TYPES.find((t) => t.value === h.serviceType)?.hint}</p>
        </Field>
        <Field label="Place of service" htmlFor="pos">
          <select id="pos" className="input" value={h.placeOfService} onChange={(e) => set({ placeOfService: e.target.value })}>
            {PLACES_OF_SERVICE.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="pt-2">
        <legend className="mb-3 text-base font-bold text-slate-900">Service lines (simplified CPT / ICD-10)</legend>
        {h.lines.length === 1 && !h.lines[0].procedureCode && (
          <div className="mb-4 rounded-2xl border border-ai-100 bg-gradient-to-br from-ai-50/70 to-white p-4">
            <p className="text-sm font-semibold text-slate-900">Start from a common visit</p>
            <p className="mt-0.5 text-xs text-slate-600">One tap fills in the codes and the usual fees. You can change anything.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {VISIT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ serviceType: t.serviceType, placeOfService: t.placeOfService, lines: templateLines(t) })}
                  className="rounded-xl bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:ring-ai-300 hover:shadow-lift"
                >
                  <span className="block text-sm font-bold text-ai-800">{t.label}</span>
                  <span className="block font-normal text-slate-500">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-3">
          {h.lines.map((l, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[2fr_2fr_80px_120px_auto] sm:items-end">
              <Field label={`Procedure ${i + 1}`} htmlFor={`proc${i}`} error={errors[`line${i}`]}>
                <select id={`proc${i}`} className="input" value={l.procedureCode} onChange={(e) => setLine(i, { procedureCode: e.target.value })}>
                  <option value="">Select…</option>
                  {PROCEDURES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} · {p.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Diagnosis" htmlFor={`dx${i}`}>
                <select id={`dx${i}`} className="input" value={l.diagnosisCode} onChange={(e) => setLine(i, { diagnosisCode: e.target.value })}>
                  <option value="">Select…</option>
                  {DIAGNOSES.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} · {d.description}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Units" htmlFor={`units${i}`}>
                <input id={`units${i}`} type="number" min={1} className="input" value={l.units} onChange={(e) => setLine(i, { units: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Billed $" htmlFor={`billed${i}`}>
                <input id={`billed${i}`} type="number" min={0} step="0.01" className="input" value={l.billedAmount || ''} onChange={(e) => setLine(i, { billedAmount: Number(e.target.value) || 0 })} />
              </Field>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Remove service line ${i + 1}`} disabled={h.lines.length === 1} onClick={() => set({ lines: h.lines.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon={Plus} className="mt-3" onClick={() => set({ lines: [...h.lines, { procedureCode: '', diagnosisCode: '', units: 1, billedAmount: 0 }] })}>
          Add service line
        </Button>
      </fieldset>
    </>
  );
}
