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

const DEMO_POLICIES = [
  { number: 'POL-100245', label: 'Auto' },
  { number: 'POL-200318', label: 'Homeowners' },
  { number: 'POL-300577', label: 'Health' },
  { number: 'POL-400112', label: 'Lapsed renters' },
];

export function PolicyStep({ draft, setDraft, role }: { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void; role: Role }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Find the <GlossaryTerm id="policy">policy</GlossaryTerm></h2>
        <p className="text-sm text-slate-600">
          {role === 'PROVIDER'
            ? "Enter the patient's plan/policy number from their insurance card and the date of service."
            : 'Your policy number is on your ID card or declarations page. We check that it was active on the date of loss.'}
        </p>
      </div>
      <form
        className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup();
        }}
      >
        <Field label="Policy number" htmlFor="policyNumber" required hint="Format: POL-123456">
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
        <div className="sm:pt-6">
          <Button type="submit" icon={Search} loading={loading} disabled={!draft.policyNumber.trim()} className="w-full sm:w-auto">
            Look up
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Demo policies:</span>
        {DEMO_POLICIES.filter((d) => role !== 'PROVIDER' || d.label === 'Health').map((d) => (
          <button
            key={d.number}
            type="button"
            className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-mono text-slate-700 hover:border-brand-500 hover:text-brand-700"
            onClick={() => setDraft({ ...draft, policyNumber: d.number, policy: undefined, dateOfLoss: draft.dateOfLoss || todayIso() })}
          >
            {d.number} <span className="font-sans text-slate-500">· {d.label}</span>
          </button>
        ))}
      </div>

      {error && <Alert tone="error" title="We couldn't verify this policy">{error}</Alert>}

      {p && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CircleCheck className="h-5 w-5" aria-hidden /> Policy verified — active on {formatDate(draft.dateOfLoss)}
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
