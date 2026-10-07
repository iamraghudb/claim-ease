import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, History, MessageSquare, Printer, ShieldCheck } from 'lucide-react';
import { CLAIM_TYPE_LABELS, DOCUMENT_CATEGORY_LABELS, POLICY_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { STATUS_LABELS } from '../../domain/statusMachine';
import { useClaim, usePolicy, useRules } from '../../store/hooks';
import { useAppStore } from '../../store/appStore';
import { formatBytes, formatDate, formatDateTime } from '../../components/format';
import { StatusBadge, STATUS_STYLES } from '../../components/badges';
import { Button, Card, cx, DescriptionList, EmptyState, Pill } from '../../components/ui';
import { ClaimDetailsCard } from './ClaimDetailsCard';
import { DecisionCard, PaymentCard } from './DecisionCard';

/** Print-friendly claim summary ("claim file"). Use the browser's Print → Save as PDF to download. */
export default function ClaimFile() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const policy = usePolicy(claim?.policyNumber);
  const rules = useRules(claim);
  const role = useAppStore((s) => s.role);
  if (!claim || !rules) return <EmptyState icon={ShieldCheck} title="Claim not found" />;
  const staff = role === 'ADJUSTER' || role === 'ADMIN';
  const history = claim.auditTrail.filter((a) => a.toStatus && (staff || a.action !== 'Note added'));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/claims/${claim.claimNumber}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to claim
        </Link>
        <Button icon={Printer} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <article className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/80 print:rounded-none print:shadow-none print:ring-0">
        <div className="h-1.5 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300 print:hidden" aria-hidden />

        <header className="px-5 pb-6 pt-6 sm:px-10 sm:pt-8">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              ClaimEase
            </p>
            <p className="eyebrow">Claim file</p>
          </div>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">{CLAIM_TYPE_LABELS[claim.claimType]} claim</p>
              <h1 className="mt-0.5 break-all font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{claim.claimNumber}</h1>
            </div>
            <StatusBadge status={claim.status} className="text-sm" />
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <DescriptionList
              cols={3}
              items={[
                { label: 'Claimant', value: claim.claimantName },
                { label: 'Policy', value: policy ? `${claim.policyNumber} · ${POLICY_TYPE_LABELS[policy.type]}` : claim.policyNumber },
                { label: 'Coverage period', value: policy ? `${formatDate(policy.effectiveDate)} – ${formatDate(policy.expiryDate)}` : '—' },
              ]}
            />
          </div>
        </header>

        <section aria-label="Amounts" className="border-y border-slate-200 bg-slate-50/70 px-5 py-6 sm:px-10 print:bg-white">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Claimed" value={formatUSD(claim.estimatedAmount)} />
            <Stat label="Calculated payable" value={formatUSD(rules.payable.payable)} />
            <Stat label="Approved" value={claim.decision ? formatUSD(claim.decision.approvedAmount) : 'Pending'} muted={!claim.decision} />
            <Stat label="Paid" value={claim.payment ? formatUSD(claim.payment.amount) : '—'} muted={!claim.payment} />
          </div>
        </section>

        <div className="space-y-6 px-5 py-7 sm:px-10 [&_.card]:rounded-xl [&_.card]:shadow-none">
          <ClaimDetailsCard claim={claim} />

          <Card title="Documents on file" icon={FileText} actions={<Pill>{claim.documents.length}</Pill>}>
            {claim.documents.length ? (
              <ul className="divide-y divide-slate-100">
                {claim.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-900">{d.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {DOCUMENT_CATEGORY_LABELS[d.category]} · {formatBytes(d.sizeBytes)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatDate(d.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No documents on file.</p>
            )}
          </Card>

          {claim.communicationLog.length > 0 && (
            <Card title="Communication log" icon={MessageSquare} actions={<Pill>{claim.communicationLog.length}</Pill>}>
              <ul className="divide-y divide-slate-100">
                {claim.communicationLog.map((c) => (
                  <li key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <Pill>{c.channel.charAt(0) + c.channel.slice(1).toLowerCase()}</Pill>
                      <span className="font-medium text-slate-700">{c.contactPerson}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDate(c.date)}</span>
                    </p>
                    <p className="mt-1.5 text-sm text-slate-800">{c.summary}</p>
                    {c.response && <p className="mt-0.5 text-sm text-slate-600">Response: {c.response}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Timeline" icon={History}>
            {history.length ? (
              <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
                {history.map((a) => (
                  <li key={a.id} className="relative break-inside-avoid">
                    <span aria-hidden className={cx('absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-white', STATUS_STYLES[a.toStatus!].dot)} />
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="text-sm font-semibold text-slate-900">{STATUS_LABELS[a.toStatus!]}</span>
                      <time dateTime={a.timestamp} className="text-xs text-slate-500">
                        {formatDateTime(a.timestamp)}
                      </time>
                    </p>
                    {a.details && <p className="mt-0.5 text-sm text-slate-600">{a.details}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">No status changes recorded yet.</p>
            )}
          </Card>

          <DecisionCard claim={claim} />
          <PaymentCard claim={claim} />
        </div>

        <footer className="border-t border-slate-200 px-5 py-4 text-xs text-slate-500 sm:px-10">Generated by ClaimEase on {formatDate(new Date().toISOString())}. For information only.</footer>
      </article>
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="eyebrow">{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums', muted ? 'text-slate-400' : 'text-slate-900')}>{value}</p>
    </div>
  );
}
