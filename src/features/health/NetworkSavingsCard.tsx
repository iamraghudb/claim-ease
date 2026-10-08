import { BadgeDollarSign } from 'lucide-react';
import type { Role } from '../../domain/types';
import { Card, InfoTip } from '../../components/ui';
import type { NetworkSavings } from './networkSavings';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;

/** One plain sentence per audience, so the same number reads right for each person. */
function headline(role: Role, s: NetworkSavings): string {
  if (!s.applies) return 'The network rate does not apply here, because this claim was not approved.';
  if (s.saved <= 0) return 'The provider billed the network rate, so there is nothing to take off.';
  if (role === 'CLAIMANT') return `Your provider is in the network, so you are not charged the ${money(s.saved)} above the agreed rate.`;
  if (role === 'PROVIDER') return `The network rate takes ${money(s.saved)} off the billed amount (${pct(s.percent)}). This is your write-off.`;
  return `The network rate takes ${money(s.saved)} off the billed amount (${pct(s.percent)}).`;
}

/** Billed against the network rate for one claim: a bar for the total, then the lines that saved the most. */
export function NetworkSavingsCard({ savings, role }: { savings: NetworkSavings; role: Role }) {
  const s = savings;
  const keptShare = s.billed > 0 ? Math.max(0, Math.min(100, (s.networkRate / s.billed) * 100)) : 0;
  const top = s.lines.slice(0, 4);

  return (
    <Card
      icon={BadgeDollarSign}
      title={
        <>
          Network savings
          <InfoTip label="About network savings">
            The network rate is the price the plan has agreed with in-network providers for each service. Anything billed above it is written off by the provider and is not billed to the patient.
          </InfoTip>
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow">Saved by the network</p>
          <p className="text-3xl font-extrabold tabular-nums tracking-tight text-emerald-700">{money(s.saved)}</p>
        </div>
        {s.applies && s.saved > 0 && (
          <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">{pct(s.percent)} off the billed amount</p>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-600">{headline(role, s)}</p>

      {s.applies && s.billed > 0 && (
        <div className="mt-4">
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-emerald-200"
            role="img"
            aria-label={`Billed ${money(s.billed)}, network rate ${money(s.networkRate)}, saved ${money(s.saved)}`}
          >
            <span className="h-full bg-brand-600" style={{ width: `${keptShare}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden /> Network rate {money(s.networkRate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-200" aria-hidden /> Saved {money(s.saved)}
            </span>
            <span className="font-medium text-slate-800">Billed {money(s.billed)}</span>
          </div>
        </div>
      )}

      {top.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100" aria-label="Services with the biggest saving">
          {top.map((l) => (
            <li key={l.procedureCode} className="flex items-start justify-between gap-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-mono text-xs font-semibold text-slate-900">{l.procedureCode}</span> <span className="text-slate-700">{l.description}</span>
                <span className="block text-xs text-slate-500">
                  Billed {money(l.billed)}, network rate {money(l.networkRate)}
                </span>
              </span>
              <span className="shrink-0 text-right font-semibold tabular-nums text-emerald-700">
                {money(l.saved)}
                <span className="block text-xs font-normal text-slate-500">{pct(l.percent)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
