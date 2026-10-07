import { Banknote, Gavel, RotateCcw, Sparkles } from 'lucide-react';
import { DENIAL_REASON_CODES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim } from '../../domain/types';
import { formatDate } from '../../components/format';
import { useAiStatus } from '../../store/useAiStatus';
import { Button, Card, DescriptionList, Pill } from '../../components/ui';
import { useCopilotStore } from '../copilot/copilotStore';

const EXPLAIN_QUESTION = 'Explain this decision to me in plain English: what was decided, why, and what I can do next.';

/**
 * `canExplain` adds an "Explain this to me" button for claimant and provider views. It hands the question to Ease, which
 * already knows the decision because the claim page registers it (see ClaimDetail). Leave it off on screens that do not.
 */
export function DecisionCard({ claim, showInternal, canExplain }: { claim: Claim; showInternal?: boolean; canExplain?: boolean }) {
  const aiStatus = useAiStatus();
  const d = claim.decision;
  if (!d) return null;
  const tone = d.outcome === 'APPROVED' ? 'green' : d.outcome === 'DENIED' ? 'red' : 'amber';
  const reason = DENIAL_REASON_CODES.find((x) => x.code === d.denialReasonCode);
  return (
    <Card title="Decision" icon={Gavel} actions={<Pill tone={tone}>{d.outcome.replace('_', ' ').toLowerCase()}</Pill>}>
      <div className={`mb-5 rounded-2xl p-5 ${d.outcome === 'APPROVED' ? 'bg-emerald-50' : d.outcome === 'DENIED' ? 'bg-red-50' : 'bg-amber-50'}`}>
        <p className="eyebrow">{d.outcome === 'DENIED' ? 'Amount approved' : 'Approved amount'}</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-900">{formatUSD(d.approvedAmount)}</p>
        <p className="mt-1 text-sm text-slate-600">
          Decided {formatDate(d.decidedAt)} by {d.decidedBy}
          {d.calculatedAmount !== d.approvedAmount && <> · calculated payable {formatUSD(d.calculatedAmount)}</>}
        </p>
      </div>
      {reason && (
        <p className="mt-3 text-sm">
          <span className="font-medium text-slate-700">Reason code:</span> {reason.code} — {reason.label}
        </p>
      )}
      <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{d.explanation}</p>
      {canExplain && !showInternal && aiStatus && (
        <div className="no-print mt-3">
          <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => void useCopilotStore.getState().ask(EXPLAIN_QUESTION)}>
            Explain this to me
          </Button>
        </div>
      )}
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
              <li key={a.id} className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-3.5 text-sm">
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
