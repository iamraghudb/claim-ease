import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building, FileHeart, Landmark, Printer, Stethoscope, User, Gavel, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { DIAGNOSES, findProcedure, PLACES_OF_SERVICE } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim, ClaimStatus } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useClaim, usePolicy, useRules } from '../../store/hooks';
import { formatDate } from '../../components/format';
import { Alert, Button, Card, cx, EmptyState, PageHeader, Tabs } from '../../components/ui';
import { GlossaryTerm } from '../../components/GlossaryTerm';

type Tab = '837' | '277' | '835';

const FLOW: { label: string; icon: LucideIcon; statuses: ClaimStatus[] }[] = [
  { label: 'Patient', icon: User, statuses: [] },
  { label: 'Provider', icon: Stethoscope, statuses: ['REPORTED'] },
  { label: 'Claim (837)', icon: FileHeart, statuses: ['REGISTERED'] },
  { label: 'Insurer', icon: Building, statuses: ['UNDER_REVIEW', 'INFORMATION_REQUIRED', 'INVESTIGATION'] },
  { label: 'Adjudication', icon: Gavel, statuses: ['ADJUDICATION', 'APPEALED', 'APPROVED', 'PARTIALLY_APPROVED', 'DENIED'] },
  { label: 'Remittance (835)', icon: Landmark, statuses: ['PAYMENT_PENDING', 'PAID'] },
  { label: 'Patient responsibility', icon: Wallet, statuses: ['CLOSED'] },
];

/** 277-style status category codes (simplified). */
function statusCategory(status: ClaimStatus): { code: string; label: string } {
  if (['REPORTED', 'REGISTERED'].includes(status)) return { code: 'A1', label: 'Acknowledgement / receipt' };
  if (status === 'INFORMATION_REQUIRED') return { code: 'P5', label: 'Pending — information requested from provider' };
  if (['UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION', 'APPEALED', 'REOPENED'].includes(status)) return { code: 'P1', label: 'Pending — in process' };
  if (status === 'DENIED') return { code: 'F2', label: 'Finalized — denied' };
  if (['PAID', 'CLOSED'].includes(status)) return { code: 'F1', label: 'Finalized — payment' };
  return { code: 'F0', label: 'Finalized — adjudication complete, payment pending' };
}

export default function HealthClaimView() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const policy = usePolicy(claim?.policyNumber);
  const rules = useRules(claim);
  const role = useAppStore((s) => s.role);
  const [tab, setTab] = useState<Tab>(claim?.decision ? '835' : '837');
  if (!claim || !rules || claim.details.kind !== 'HEALTH') return <EmptyState icon={FileHeart} title="Health claim not found" />;
  const d = claim.details;
  const staff = role === 'ADJUSTER' || role === 'ADMIN';
  const activeIdx = FLOW.findIndex((f) => f.statuses.includes(claim.status));

  // Remittance figures: use the decision if one exists; scale plan-paid lines if the examiner overrode the total.
  const p = rules.payable;
  const approved = claim.decision?.approvedAmount;
  const denied = claim.decision?.outcome === 'DENIED';
  const scale = approved !== undefined && p.payable > 0 ? approved / p.payable : 1;
  const lines = (p.lines ?? []).map((l) => {
    const planPaid = denied ? 0 : Math.round(l.planPaid * scale * 100) / 100;
    return { ...l, planPaid, patientResponsibility: denied ? l.billed : Math.round((l.allowed - planPaid + (l.covered ? 0 : l.billed)) * 100) / 100 };
  });
  const totals = {
    billed: lines.reduce((s, l) => s + l.billed, 0),
    allowed: lines.reduce((s, l) => s + l.allowed, 0),
    planPaid: lines.reduce((s, l) => s + l.planPaid, 0),
    patient: lines.reduce((s, l) => s + l.patientResponsibility, 0),
  };
  const sc = statusCategory(claim.status);

  return (
    <div>
      <PageHeader
        back={
          <Link to={staff ? `/queue/${claim.claimNumber}` : `/claims/${claim.claimNumber}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to claim
          </Link>
        }
        title={<>Health claim · <span className="font-mono">{claim.claimNumber}</span></>}
        subtitle={`${d.patientName} · ${d.provider.name} · service ${formatDate(claim.dateOfLoss)}`}
        actions={
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <Alert tone="warn" title="Simplified illustration">
        These views illustrate HIPAA transaction concepts (837 claim, 276/277 claim status, 835 remittance advice). They are <strong>not real X12 EDI</strong> and omit required segments, loops and identifiers.
      </Alert>

      <Card title="Health claim flow" className="mt-6">
        <ol className="flex flex-wrap items-center gap-2" aria-label="Health claim flow">
          {FLOW.map((f, i) => (
            <li key={f.label} className="flex items-center gap-2">
              <span
                className={cx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium',
                  i < activeIdx || (claim.status === 'CLOSED' && i <= activeIdx) ? 'bg-brand-600 text-white' : i === activeIdx ? 'bg-white text-brand-800 ring-2 ring-brand-600' : 'bg-slate-100 text-slate-500',
                )}
                aria-current={i === activeIdx ? 'step' : undefined}
              >
                <f.icon className="h-4 w-4" aria-hidden /> {f.label}
              </span>
              {i < FLOW.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-slate-600">Current status: {STATUS_LABELS[claim.status]}</p>
      </Card>

      <div className="mt-6">
        <Tabs<Tab>
          label="Transaction views"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: '837', label: '837-style claim' },
            { value: '277', label: '276/277-style status' },
            { value: '835', label: '835-style remittance / EOB' },
          ]}
        />
      </div>

      {tab === '837' && (
        <Card className="mt-4" title="Professional claim summary (837P-style)" icon={FileHeart}>
          <Segments
            rows={[
              ['Billing provider', `${d.provider.name} · NPI ${d.provider.npi} · TIN ${d.provider.taxId}`],
              ['Subscriber / payer ID', `${policy?.members?.find((m) => m.relationship === 'SUBSCRIBER')?.name ?? '—'} · ${claim.policyNumber}`],
              ['Patient', `${d.patientName} · DOB ${formatDate(d.patientDob)} · member ${d.memberId}`],
              ['Claim control #', claim.claimNumber],
              ['Place of service', PLACES_OF_SERVICE.find((x) => x.value === d.placeOfService)?.label ?? d.placeOfService],
              ['Diagnosis codes (ICD-10)', [...new Set(d.lines.map((l) => l.diagnosisCode))].map((c) => `${c} ${DIAGNOSES.find((x) => x.code === c)?.description ?? ''}`).join('; ')],
              ['Total charge', formatUSD(totals.billed)],
            ]}
          />
          <LinesTable claim={claim} />
        </Card>
      )}

      {tab === '277' && (
        <Card className="mt-4" title="Claim status response (277-style)" icon={Receipt}>
          <Segments
            rows={[
              ['Inquiry (276)', `Status of ${claim.claimNumber} for ${d.patientName}, DOS ${formatDate(claim.dateOfLoss)}`],
              ['Status category', `${sc.code} — ${sc.label}`],
              ['Status effective', formatDate(claim.updatedAt)],
              ['Total charge', formatUSD(totals.billed)],
              ['Payment amount', claim.payment ? formatUSD(claim.payment.amount) : '—'],
              ['Adjudication date', claim.decision ? formatDate(claim.decision.decidedAt) : '—'],
            ]}
          />
        </Card>
      )}

      {tab === '835' && (
        <Card className="mt-4" title="Remittance advice / explanation of benefits (835-style)" icon={Landmark}>
          {!claim.decision ? (
            <p className="text-sm text-slate-600">No remittance yet: the claim has not been adjudicated. Projected figures below come from the rules engine.</p>
          ) : (
            <Segments
              rows={[
                ['Claim status', claim.decision.outcome.replace('_', ' ').toLowerCase()],
                ['Payee', d.provider.name],
                ['Payment', claim.payment ? `${formatUSD(claim.payment.amount)} · ${claim.payment.method} · ${claim.payment.reference} · ${formatDate(claim.payment.date)}` : 'Pending'],
              ]}
            />
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Service line adjudication</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Service</th>
                  <th className="py-2 pr-3 text-right font-medium">Billed</th>
                  <th className="py-2 pr-3 text-right font-medium">Allowed</th>
                  <th className="py-2 pr-3 text-right font-medium"><GlossaryTerm id="deductible" /></th>
                  <th className="py-2 pr-3 text-right font-medium"><GlossaryTerm id="copay" /></th>
                  <th className="py-2 pr-3 text-right font-medium"><GlossaryTerm id="coinsurance" /></th>
                  <th className="py-2 pr-3 text-right font-medium">Plan paid</th>
                  <th className="py-2 text-right font-medium">Patient resp.</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <span className="font-mono">{l.procedureCode}</span> {l.description}
                      {l.remarkCode && <span className="block text-xs text-slate-500">{l.remarkCode}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatUSD(l.billed)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatUSD(l.allowed)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatUSD(l.deductible)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatUSD(l.copay)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatUSD(l.coinsurance)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatUSD(l.planPaid)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatUSD(l.patientResponsibility)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3">Totals</td>
                  <td className="py-2 pr-3 text-right">{formatUSD(totals.billed)}</td>
                  <td className="py-2 pr-3 text-right">{formatUSD(totals.allowed)}</td>
                  <td colSpan={3} />
                  <td className="py-2 pr-3 text-right text-emerald-700">{formatUSD(totals.planPaid)}</td>
                  <td className="py-2 text-right">{formatUSD(totals.patient)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Box label="Billed" value={formatUSD(totals.billed)} />
            <Box label="Allowed" value={formatUSD(totals.allowed)} />
            <Box label="Plan paid" value={formatUSD(totals.planPaid)} />
            <Box label="Patient responsibility" value={formatUSD(totals.patient)} strong />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Provider write-off (billed above allowed, in-network): {formatUSD(p.contractualAdjustment)}. The patient is not billed for this amount. {p.notes.filter((n) => !n.startsWith('Provider write-off')).join(' ')}
          </p>
        </Card>
      )}
    </div>
  );
}

function Segments({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 font-mono text-xs sm:text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-[220px_1fr]">
          <dt className="font-sans font-medium text-slate-500">{k}</dt>
          <dd className="text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinesTable({ claim }: { claim: Claim }) {
  if (claim.details.kind !== 'HEALTH') return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Service lines</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-medium">Line</th>
            <th className="py-2 pr-3 font-medium">CPT/HCPCS</th>
            <th className="py-2 pr-3 font-medium">Dx pointer</th>
            <th className="py-2 pr-3 text-right font-medium">Units</th>
            <th className="py-2 text-right font-medium">Charge</th>
          </tr>
        </thead>
        <tbody>
          {claim.details.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 pr-3">{i + 1}</td>
              <td className="py-2 pr-3">
                <span className="font-mono">{l.procedureCode}</span> {findProcedure(l.procedureCode)?.description}
              </td>
              <td className="py-2 pr-3 font-mono">{l.diagnosisCode}</td>
              <td className="py-2 pr-3 text-right">{l.units}</td>
              <td className="py-2 text-right">{formatUSD(l.billedAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('rounded-lg p-3', strong ? 'bg-brand-600 text-white' : 'bg-slate-50')}>
      <p className={cx('text-xs uppercase tracking-wide', strong ? 'text-brand-100' : 'text-slate-500')}>{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
