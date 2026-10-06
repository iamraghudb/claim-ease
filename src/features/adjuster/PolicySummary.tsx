import { ShieldCheck } from 'lucide-react';
import { POLICY_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Customer, Policy } from '../../domain/types';
import { formatDate } from '../../components/format';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Card, DescriptionList, Pill } from '../../components/ui';

export function PolicySummary({ policy, customer }: { policy?: Policy; customer?: Customer }) {
  if (!policy) return <Card title="Policy">Policy not found.</Card>;
  return (
    <Card title={<>Policy {policy.policyNumber}</>} icon={ShieldCheck} actions={<Pill tone={policy.status === 'ACTIVE' ? 'green' : 'red'}>{policy.status}</Pill>}>
      <DescriptionList
        items={[
          { label: 'Type', value: POLICY_TYPE_LABELS[policy.type] },
          { label: 'Named insured', value: customer?.name },
          { label: 'Period', value: `${formatDate(policy.effectiveDate)} – ${formatDate(policy.expiryDate)}` },
          { label: <GlossaryTerm id="premium" />, value: `${formatUSD(policy.premium)} / yr` },
          { label: <GlossaryTerm id="deductible" />, value: formatUSD(policy.deductible) },
          ...(policy.health
            ? [
                { label: <GlossaryTerm id="copay" />, value: formatUSD(policy.health.copay) },
                { label: <GlossaryTerm id="coinsurance" />, value: `${policy.health.coinsurance * 100}%` },
                { label: <GlossaryTerm id="outOfPocketMax" />, value: `${formatUSD(policy.health.outOfPocketMet)} of ${formatUSD(policy.health.outOfPocketMax)} met` },
                { label: 'Deductible met', value: `${formatUSD(policy.health.deductibleMet)} of ${formatUSD(policy.deductible)}` },
              ]
            : []),
        ]}
      />
      <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Coverages</h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {policy.coverages.map((c) => (
          <li key={c.name} className="flex justify-between py-1.5">
            <span>{c.name}</span>
            <span className="text-slate-600">{c.limit ? formatUSD(c.limit) : 'Per plan'}</span>
          </li>
        ))}
      </ul>
      <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <GlossaryTerm id="exclusion">Exclusions</GlossaryTerm>
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {policy.exclusions.map((e) => (
          <Pill key={e} tone="red">
            {e.replace('_', ' ').toLowerCase()}
          </Pill>
        ))}
      </div>
      {policy.members && (
        <>
          <h3 className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Members</h3>
          <ul className="text-sm">
            {policy.members.map((m) => (
              <li key={m.memberId} className="flex justify-between py-1">
                <span>{m.name}</span>
                <span className="font-mono text-xs text-slate-500">{m.memberId}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {policy.vehicles && (
        <p className="mt-3 text-sm text-slate-600">Vehicle: {policy.vehicles.map((v) => `${v.year} ${v.make} ${v.model}`).join(', ')}</p>
      )}
    </Card>
  );
}
