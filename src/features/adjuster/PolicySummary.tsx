import type { ReactNode } from 'react';
import { Car, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { POLICY_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Customer, Policy } from '../../domain/types';
import { formatDate } from '../../components/format';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Card, cx, Pill } from '../../components/ui';

function Fact({ label, value, wide }: { label: ReactNode; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('min-w-0', wide && 'col-span-2')}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}

/** A thin progress bar: "$X of $Y met". */
function Progress({ label, value, max }: { label: ReactNode; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">
          {formatUSD(value)} <span className="font-normal text-slate-500">of {formatUSD(max)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={`${pct}% met`}>
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PolicySummary({ policy, customer }: { policy?: Policy; customer?: Customer }) {
  if (!policy)
    return (
      <Card title="Policy" icon={ShieldQuestion}>
        <p className="text-sm text-slate-600">We could not find the policy linked to this claim. Check the policy number on the claim details.</p>
      </Card>
    );

  const h = policy.health;
  return (
    <Card title="Policy" icon={ShieldCheck} actions={<Pill tone={policy.status === 'ACTIVE' ? 'green' : 'red'}>{policy.status.charAt(0) + policy.status.slice(1).toLowerCase()}</Pill>}>
      <p className="-mt-1 mb-4 font-mono text-sm font-semibold text-slate-900">{policy.policyNumber}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        <Fact label="Type" value={POLICY_TYPE_LABELS[policy.type]} />
        <Fact label="Named insured" value={customer?.name} />
        <Fact label="Period" value={`${formatDate(policy.effectiveDate)} – ${formatDate(policy.expiryDate)}`} wide />
        <Fact label={<GlossaryTerm id="premium" />} value={`${formatUSD(policy.premium)} / yr`} />
        <Fact label={<GlossaryTerm id="deductible" />} value={formatUSD(policy.deductible)} />
        {h && <Fact label={<GlossaryTerm id="copay" />} value={formatUSD(h.copay)} />}
        {h && <Fact label={<GlossaryTerm id="coinsurance" />} value={`${Math.round(h.coinsurance * 100)}%`} />}
      </dl>

      {h && (
        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3.5">
          <Progress label="Deductible met" value={h.deductibleMet} max={policy.deductible} />
          <Progress label={<GlossaryTerm id="outOfPocketMax">Out-of-pocket max</GlossaryTerm>} value={h.outOfPocketMet} max={h.outOfPocketMax} />
        </div>
      )}

      <h3 className="eyebrow mb-1 mt-5">Coverages</h3>
      <ul className="divide-y divide-slate-100 text-sm">
        {policy.coverages.map((c) => (
          <li key={c.name} className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-slate-800">{c.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{c.limit ? formatUSD(c.limit) : <span className="font-normal text-slate-500">Per plan</span>}</span>
          </li>
        ))}
      </ul>

      <h3 className="eyebrow mb-2 mt-5">
        <GlossaryTerm id="exclusion">Exclusions</GlossaryTerm>
      </h3>
      {policy.exclusions.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {policy.exclusions.map((e) => (
            <li key={e}>
              <Pill tone="red">{e.replace(/_/g, ' ').toLowerCase()}</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">None listed.</p>
      )}

      {policy.members && policy.members.length > 0 && (
        <>
          <h3 className="eyebrow mb-1 mt-5">Members</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {policy.members.map((m) => (
              <li key={m.memberId} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-800">{m.name}</span>
                <span className="font-mono text-xs text-slate-500">{m.memberId}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {policy.vehicles && policy.vehicles.length > 0 && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <Car className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span>{policy.vehicles.map((v) => `${v.year} ${v.make} ${v.model}`).join(', ')}</span>
        </p>
      )}
    </Card>
  );
}
