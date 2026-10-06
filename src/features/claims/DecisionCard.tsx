import { Banknote, Gavel, RotateCcw } from 'lucide-react';
import { DENIAL_REASON_CODES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim } from '../../domain/types';
import { formatDate } from '../../components/format';
import { Card, DescriptionList, Pill } from '../../components/ui';

export function DecisionCard({ claim, showInternal }: { claim: Claim; showInternal?: boolean }) {
  const d = claim.decision;
  if (!d) return null;
  const tone = d.outcome === 'APPROVED' ? 'green' : d.outcome === 'DENIED' ? 'red' : 'amber';
  const reason = DENIAL_REASON_CODES.find((x) => x.code === d.denialReasonCode);
  return (
    <Card title="Decision" icon={Gavel} actions={<Pill tone={tone}>{d.outcome.replace('_', ' ').toLowerCase()}</Pill>}>
      <DescriptionList
        cols={3}
        items={[
          { label: 'Approved amount', value: <span className="text-lg font-semibold">{formatUSD(d.approvedAmount)}</span> },
          { label: 'Calculated payable', value: formatUSD(d.calculatedAmount) },
          { label: 'Decided', value: `${formatDate(d.decidedAt)} by ${d.decidedBy}` },
        ]}
      />
      {reason && (
        <p className="mt-3 text-sm">
          <span className="font-medium text-slate-700">Reason code:</span> {reason.code} — {reason.label}
        </p>
      )}
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{d.explanation}</p>
      {d.overrideReason && (
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-medium">Adjustment from calculated amount:</span> {d.overrideReason}
        </p>
      )}
      {claim.appeals.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Appeals
          </p>
          <ul className="mt-2 space-y-2">
            {claim.appeals.map((a) => (
              <li key={a.id} className="rounded-lg border border-fuchsia-100 bg-fuchsia-50/50 p-3 text-sm">
                <p className="text-xs text-slate-500">
                  Filed {formatDate(a.filedAt)} by {a.filedBy} · prior decision {a.previousOutcome.replace('_', ' ').toLowerCase()} ({formatUSD(a.previousAmount)})
                </p>
                <p className="mt-1 text-slate-800">{a.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showInternal && claim.decisionHistory.length > 1 && (
        <p className="mt-3 text-xs text-slate-500">{claim.decisionHistory.length} decisions recorded on this claim (see audit trail).</p>
      )}
    </Card>
  );
}

export function PaymentCard({ claim }: { claim: Claim }) {
  const p = claim.payment;
  if (!p) return null;
  return (
    <Card title="Payment" icon={Banknote} actions={<Pill tone="green">Issued</Pill>}>
      <DescriptionList
        cols={3}
        items={[
          { label: 'Amount', value: <span className="text-lg font-semibold">{formatUSD(p.amount)}</span> },
          { label: 'Method', value: p.method.replace('_', ' ') },
          { label: 'Date', value: formatDate(p.date) },
          { label: 'Reference', value: <span className="font-mono">{p.reference}</span> },
          { label: 'Payee', value: claim.details.kind === 'HEALTH' ? claim.details.provider.name : claim.claimantName },
          { label: 'Issued by', value: p.issuedBy },
        ]}
      />
    </Card>
  );
}
