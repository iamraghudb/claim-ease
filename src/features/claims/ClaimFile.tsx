import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldCheck } from 'lucide-react';
import { CLAIM_TYPE_LABELS, DOCUMENT_CATEGORY_LABELS, POLICY_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { STATUS_LABELS } from '../../domain/statusMachine';
import { useClaim, usePolicy, useRules } from '../../store/hooks';
import { useAppStore } from '../../store/appStore';
import { formatDate, formatDateTime } from '../../components/format';
import { Button, EmptyState } from '../../components/ui';
import { ClaimDetailsCard } from './ClaimDetailsCard';
import { DecisionCard, PaymentCard } from './DecisionCard';
import { SLA_DISCLAIMER } from '../../domain/sla';

/** Print-friendly claim summary ("claim file"). Use the browser's Print → Save as PDF to download. */
export default function ClaimFile() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const policy = usePolicy(claim?.policyNumber);
  const rules = useRules(claim);
  const role = useAppStore((s) => s.role);
  if (!claim || !rules) return <EmptyState icon={ShieldCheck} title="Claim not found" />;
  const staff = role === 'ADJUSTER' || role === 'ADMIN';

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to={`/claims/${claim.claimNumber}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to claim
        </Link>
        <Button icon={Printer} onClick={() => window.print()}>
          Print / save as PDF
        </Button>
      </div>

      <article className="space-y-5 bg-white sm:rounded-xl sm:border sm:border-slate-200 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-brand-800">
              <ShieldCheck className="h-5 w-5" aria-hidden /> ClaimEase · Claim file
            </p>
            <h1 className="mt-1 font-mono text-2xl font-bold">{claim.claimNumber}</h1>
            <p className="text-sm text-slate-600">
              {CLAIM_TYPE_LABELS[claim.claimType]} claim · {STATUS_LABELS[claim.status]}
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p>Generated {formatDateTime(new Date().toISOString())}</p>
            <p>Policy {claim.policyNumber}</p>
            {policy && <p>{POLICY_TYPE_LABELS[policy.type]} · {formatDate(policy.effectiveDate)} – {formatDate(policy.expiryDate)}</p>}
          </div>
        </header>

        <section className="grid gap-4 text-sm sm:grid-cols-4">
          <Stat label="Claimed" value={formatUSD(claim.estimatedAmount)} />
          <Stat label="Calculated payable" value={formatUSD(rules.payable.payable)} />
          <Stat label="Approved" value={claim.decision ? formatUSD(claim.decision.approvedAmount) : 'Pending'} />
          <Stat label="Paid" value={claim.payment ? formatUSD(claim.payment.amount) : '—'} />
        </section>

        <ClaimDetailsCard claim={claim} />
        <DecisionCard claim={claim} />
        <PaymentCard claim={claim} />

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Documents on file ({claim.documents.length})</h2>
          <table className="w-full text-sm">
            <tbody>
              {claim.documents.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{d.fileName}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{DOCUMENT_CATEGORY_LABELS[d.category]}</td>
                  <td className="py-1.5 text-right text-slate-500">{formatDate(d.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {claim.communicationLog.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Communication log</h2>
            <ul className="space-y-2 text-sm">
              {claim.communicationLog.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{formatDate(c.date)} · {c.channel.toLowerCase()} · {c.contactPerson}:</span> {c.summary}
                  {c.response && <span className="text-slate-600"> — {c.response}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Status history</h2>
          <table className="w-full text-sm">
            <tbody>
              {claim.auditTrail
                .filter((a) => a.toStatus && (staff || a.action !== 'Note added'))
                .map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">{formatDateTime(a.timestamp)}</td>
                    <td className="py-1.5 pr-2 font-medium">{STATUS_LABELS[a.toStatus!]}</td>
                    <td className="py-1.5 text-slate-600">{a.details ?? ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
        <p className="text-xs text-slate-500">{SLA_DISCLAIMER} This document is a demo summary and not an official record.</p>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
