import { useState } from 'react';
import { CircleCheck, Search } from 'lucide-react';
import { POLICY_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Role } from '../../domain/types';
import { policyService } from '../../services';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { formatDate, todayIso } from '../../components/format';
import { Alert, Button, DescriptionList, Field, EstimatedToggle } from '../../components/ui';
import { applyPolicy, toggleEstimated, type IntakeDraft } from './draft';
import { selectVisibleClaims, useAppStore } from '../../store/appStore';
import { Avatar } from '../../components/ui';
import { recentPatients } from '../provider/practice';

const SAMPLE_POLICIES = [
  { number: 'POL-100245', label: 'Auto' },
  { number: 'POL-200318', label: 'Homeowners' },
  { number: 'POL-300577', label: 'Health' },
  { number: 'POL-400112', label: 'Lapsed renters' },
];

export function PolicyStep({ draft, setDraft, role }: { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void; role: Role }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const store = useAppStore();
  const patients = role === 'PROVIDER' ? recentPatients(selectVisibleClaims(store), 4) : [];

  async function lookup() {
    setError('');
    if (!draft.dateOfLoss) {
      setError(`Enter the ${role === 'PROVIDER' ? 'date of service' : 'date of loss'} so we can check coverage.`);
      return;
    }
    setLoading(true);
    try {
      const { policy, customer } = await policyService.lookup(draft.policyNumber, draft.dateOfLoss);
      if (role === 'PROVIDER' && policy.type !== 'HEALTH') throw new Error('Healthcare providers can only submit claims against health plans.');
      setDraft(applyPolicy(draft, policy, customer));
    } catch (e) {
      setDraft({ ...draft, policy: undefined, customer: undefined });
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  const p = draft.policy;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          {role === 'PROVIDER' ? 'Which plan is the patient on?' : <>Which <GlossaryTerm id="policy">policy</GlossaryTerm> is this for?</>}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {role === 'PROVIDER'
            ? "Enter the plan number from the patient's insurance card and the date of service."
            : 'Your policy number is on your ID card or declarations page. We check that it was active on the day it happened.'}
        </p>
      </div>
      {role === 'PROVIDER' && patients.length > 0 && (
        <div>
          <p className="eyebrow mb-2">Billing for a patient you have seen before?</p>
          <div className="flex flex-wrap gap-2">
            {patients.map((p) => {
              const picked = draft.health.memberId === p.memberId && draft.policyNumber === p.policyNumber;
              return (
                <button
                  key={p.memberId}
                  type="button"
                  aria-pressed={picked}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      policyNumber: p.policyNumber,
                      policy: undefined,
                      dateOfLoss: draft.dateOfLoss || todayIso(),
                      health: { ...draft.health, memberId: p.memberId, patientName: p.patientName, patientDob: p.patientDob },
                    })
                  }
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 ${picked ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-slate-200 hover:ring-brand-300'}`}
                >
                  <Avatar name={p.patientName} tone="teal" size="sm" />
                  <span className="leading-tight">
                    <span className="block text-sm font-bold text-slate-900">{p.patientName}</span>
                    <span className="block text-xs text-slate-500">{p.memberId}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <form
        className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_210px_auto] sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <Field label="Policy number" htmlFor="policyNumber" required hint="Looks like POL-123456">
          <input
            id="policyNumber"
            className="input font-mono uppercase"
            placeholder="POL-000000"
            autoComplete="off"
            value={draft.policyNumber}
            onChange={(e) => setDraft({ ...draft, policyNumber: e.target.value, policy: undefined })}
          />
        </Field>
        <div>
          <Field label={role === 'PROVIDER' ? 'Date of service' : 'Date of loss'} htmlFor="dateOfLoss" required>
            <input id="dateOfLoss" type="date" className="input" max={todayIso()} value={draft.dateOfLoss} onChange={(e) => setDraft({ ...draft, dateOfLoss: e.target.value, policy: undefined })} />
          </Field>
          {role !== 'PROVIDER' && <EstimatedToggle checked={draft.estimatedFields.includes('dateOfLoss')} onChange={(v) => setDraft(toggleEstimated(draft, 'dateOfLoss', v))} />}
        </div>
        <div className="sm:pt-[30px]">
          <Button type="submit" icon={Search} loading={loading} disabled={!draft.policyNumber.trim()} className="w-full sm:w-auto">
            Check policy
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium">Try a sample:</span>
        {SAMPLE_POLICIES.filter((d) => role !== 'PROVIDER' || d.label === 'Health').map((d) => (
          <button
            key={d.number}
            type="button"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:border-brand-400 hover:text-brand-700"
            onClick={() => setDraft({ ...draft, policyNumber: d.number, policy: undefined, dateOfLoss: draft.dateOfLoss || todayIso() })}
          >
            <span className="font-mono">{d.number}</span> <span className="text-slate-400">· {d.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <Alert tone="error" title="We couldn't verify this policy">
          {error}
        </Alert>
      )}

      {p && (
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
          <p className="mb-4 flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CircleCheck className="h-5 w-5" aria-hidden /> Policy verified: it was active on {formatDate(draft.dateOfLoss)}
          </p>
          <DescriptionList
            cols={3}
            items={[
              { label: 'Policy', value: <span className="font-mono">{p.policyNumber}</span> },
              { label: 'Type', value: POLICY_TYPE_LABELS[p.type] },
              { label: 'Named insured', value: draft.customer?.name },
              { label: 'Coverage period', value: `${formatDate(p.effectiveDate)} – ${formatDate(p.expiryDate)}` },
              { label: <GlossaryTerm id="deductible" />, value: formatUSD(p.deductible) + (p.type === 'HEALTH' ? ' / year' : '') },
              {
                label: 'Coverages',
                value: p.coverages
                  .slice(0, 4)
                  .map((c) => c.name)
                  .join(', '),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
