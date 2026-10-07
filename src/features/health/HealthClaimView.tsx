import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Building2, Check, FileHeart, Gavel, Info, Landmark, Printer, Receipt, Stethoscope, User, Wallet, type LucideIcon } from 'lucide-react';
import { DIAGNOSES, findProcedure, PLACES_OF_SERVICE, POLICY_TYPE_LABELS } from '../../domain/catalog';
import type { Claim, ClaimStatus } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useClaim, usePolicy, useRules } from '../../store/hooks';
import { formatDate } from '../../components/format';
import { StatusBadge } from '../../components/badges';
import { Button, Card, cx, EmptyState, InfoTip, PageHeader, Pill, Tabs } from '../../components/ui';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { useCopilotPage } from '../copilot/pages';
import { CostExplainer } from './CostExplainer';
import { costContext, healthPageData, remittance } from './remittance';

type Tab = '837' | '277' | '835';

const TAB_LABELS: Record<Tab, string> = { '837': 'Claim (837)', '277': 'Status (277)', '835': 'Remittance (835)' };

/** One decimal convention for every amount on this screen: always cents, so columns line up. */
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STAGES: { label: string; icon: LucideIcon; statuses: ClaimStatus[] }[] = [
  { label: 'Care received', icon: User, statuses: [] },
  { label: 'Provider bills', icon: Stethoscope, statuses: ['REPORTED'] },
  { label: 'Claim sent (837)', icon: FileHeart, statuses: ['REGISTERED'] },
  { label: 'Insurer review', icon: Building2, statuses: ['UNDER_REVIEW', 'INFORMATION_REQUIRED', 'INVESTIGATION'] },
  { label: 'Decision', icon: Gavel, statuses: ['ADJUDICATION', 'APPEALED', 'APPROVED', 'PARTIALLY_APPROVED', 'DENIED'] },
  { label: 'Remittance (835)', icon: Landmark, statuses: ['PAYMENT_PENDING', 'PAID'] },
  { label: 'Patient balance', icon: Wallet, statuses: ['CLOSED'] },
];

/** 277-style status category codes (simplified). */
function statusCategory(status: ClaimStatus): { code: string; label: string } {
  if (['REPORTED', 'REGISTERED'].includes(status)) return { code: 'A1', label: 'Acknowledgement / receipt' };
  if (status === 'INFORMATION_REQUIRED') return { code: 'P5', label: 'Pending: information requested from provider' };
  if (['UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION', 'APPEALED', 'REOPENED'].includes(status)) return { code: 'P1', label: 'Pending: in process' };
  if (status === 'DENIED') return { code: 'F2', label: 'Finalized: denied' };
  if (['PAID', 'CLOSED'].includes(status)) return { code: 'F1', label: 'Finalized: payment' };
  return { code: 'F0', label: 'Finalized: adjudication complete, payment pending' };
}

export default function HealthClaimView() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const policy = usePolicy(claim?.policyNumber);
  const rules = useRules(claim);
  const role = useAppStore((s) => s.role);
  const [tab, setTab] = useState<Tab>(claim?.decision ? '835' : '837');

  // The remittance figures are worked out once, here, so the screen and Ease always agree.
  const remit = useMemo(() => (claim && rules ? remittance(claim, rules.payable) : undefined), [claim, rules]);

  // Tell Ease what this screen shows: amounts and codes only, no patient, member or provider details.
  const viewing = TAB_LABELS[tab];
  const copilotPage = useMemo(
    () =>
      claim && rules && remit && claim.details.kind === 'HEALTH'
        ? {
            path: `/health/${claim.claimNumber}`,
            title: `Health claim flow for ${claim.claimNumber}`,
            summary: 'How a health claim moves between patient, provider and insurer, with the 837-style claim, the 277-style status and the 835-style remittance.',
            data: healthPageData(claim, remit, rules.payable, viewing),
            suggestions: ['What is the 835 remittance?', role === 'CLAIMANT' ? 'Why do I owe this amount?' : 'Why does the patient owe this amount?', 'What happens next?'],
          }
        : null,
    [claim, rules, remit, viewing, role],
  );
  useCopilotPage(copilotPage);

  if (!claim || !rules || !remit || claim.details.kind !== 'HEALTH') return <EmptyState icon={FileHeart} title="Health claim not found" />;
  const d = claim.details;
  const staff = role === 'ADJUSTER' || role === 'ADMIN';
  const activeIdx = STAGES.findIndex((f) => f.statuses.includes(claim.status));
  const holder: 'provider' | 'payer' | 'patient' = claim.status === 'CLOSED' ? 'patient' : activeIdx >= 0 && activeIdx <= 2 ? 'provider' : 'payer';

  const p = rules.payable;
  const { lines, totals } = remit;
  const owe = costContext(remit, p);
  const sc = statusCategory(claim.status);
  const subscriber = policy?.members?.find((m) => m.relationship === 'SUBSCRIBER')?.name ?? '—';

  return (
    <div>
      <PageHeader
        back={
          <Link to={staff ? `/queue/${claim.claimNumber}` : `/claims/${claim.claimNumber}`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to claim
          </Link>
        }
        title={
          <>
            Health claim · <span className="font-mono">{claim.claimNumber}</span>
          </>
        }
        subtitle={`${d.patientName} · ${d.provider.name} · service ${formatDate(claim.dateOfLoss)}`}
        actions={
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <Card
        title={
          <>
            Claim flow
            <InfoTip label="About these views">
              A simplified view of the HIPAA transactions (837 claim, 276/277 status, 835 remittance). It is not real X12 EDI: required segments, loops and identifiers are left out.
            </InfoTip>
          </>
        }
        actions={<StatusBadge status={claim.status} />}
      >
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:gap-0">
          <Party icon={User} role="Patient" name={d.patientName} detail={`Member ${d.memberId}`} active={holder === 'patient'} />
          <Connector forward="Care" back="Bill" />
          <Party icon={Stethoscope} role="Provider" name={d.provider.name} detail={`NPI ${d.provider.npi}`} active={holder === 'provider'} />
          <Connector forward="837 claim" back="835 remittance" />
          <Party icon={Building2} role="Payer" name={policy ? POLICY_TYPE_LABELS[policy.type] : 'Health plan'} detail={`Policy ${claim.policyNumber}`} active={holder === 'payer'} />
        </div>

        <ol className="mt-7 flex flex-col md:flex-row" aria-label="Claim stages">
          {STAGES.map((s, i) => {
            const done = i < activeIdx || (claim.status === 'CLOSED' && i <= activeIdx);
            const current = i === activeIdx;
            return (
              <li key={s.label} className="relative flex flex-1 items-start gap-3 pb-4 last:pb-0 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center" aria-current={current ? 'step' : undefined}>
                {i < STAGES.length - 1 && (
                  <span
                    aria-hidden
                    className={cx(
                      'absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-0.5 md:left-[calc(50%+18px)] md:top-[17px] md:h-0.5 md:w-[calc(100%-36px)]',
                      done ? 'bg-brand-500' : 'bg-slate-200',
                    )}
                  />
                )}
                <span
                  className={cx(
                    'relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2',
                    done && 'border-brand-600 bg-brand-600 text-white',
                    current && 'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100',
                    !done && !current && 'border-slate-200 bg-white text-slate-400',
                  )}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : <s.icon className="h-4 w-4" aria-hidden />}
                </span>
                <p className={cx('pt-1.5 text-sm font-medium md:max-w-[7.5rem] md:pt-0 md:text-xs', current ? 'text-slate-900' : done ? 'text-slate-700' : 'text-slate-400')}>
                  {s.label}
                  <span className="sr-only"> — {current ? 'current' : done ? 'done' : 'upcoming'}</span>
                </p>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="mt-6">
        <Tabs<Tab>
          label="Transaction views"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: '837', label: TAB_LABELS['837'] },
            { value: '277', label: TAB_LABELS['277'] },
            { value: '835', label: TAB_LABELS['835'] },
          ]}
        />
      </div>

      {tab === '837' && (
        <Card className="mt-4" title="Professional claim summary" icon={FileHeart} actions={<Pill tone="blue">837P-style</Pill>}>
          <Facts
            items={[
              { label: 'Billing provider', value: d.provider.name, sub: `NPI ${d.provider.npi} · TIN ${d.provider.taxId}` },
              { label: 'Subscriber / payer ID', value: subscriber, sub: claim.policyNumber },
              { label: 'Patient', value: d.patientName, sub: `DOB ${formatDate(d.patientDob)} · member ${d.memberId}` },
              { label: 'Claim control number', value: claim.claimNumber, mono: true },
              { label: 'Place of service', value: PLACES_OF_SERVICE.find((x) => x.value === d.placeOfService)?.label ?? d.placeOfService },
              { label: 'Total charge', value: <span className="text-lg font-bold tabular-nums">{money(totals.billed)}</span> },
              {
                label: 'Diagnosis codes (ICD-10)',
                wide: true,
                value: (
                  <span className="flex flex-wrap gap-2">
                    {[...new Set(d.lines.map((l) => l.diagnosisCode))].map((c) => (
                      <span key={c} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        <span className="font-mono font-semibold text-slate-900">{c}</span>
                        {DIAGNOSES.find((x) => x.code === c)?.description}
                      </span>
                    ))}
                  </span>
                ),
              },
            ]}
          />
          <h3 className="eyebrow mb-3 mt-6">Service lines</h3>
          <LinesTable claim={claim} total={totals.billed} />
        </Card>
      )}

      {tab === '277' && (
        <Card className="mt-4" title="Claim status response" icon={Receipt} actions={<Pill tone="blue">277-style</Pill>}>
          <div className="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white font-mono text-sm font-bold text-brand-700 shadow-sm ring-1 ring-slate-200">{sc.code}</span>
            <div className="min-w-0">
              <p className="eyebrow">Status category</p>
              <p className="text-sm font-semibold text-slate-900">{sc.label}</p>
            </div>
          </div>
          <Facts
            items={[
              { label: 'Inquiry (276)', value: `Status of ${claim.claimNumber}`, sub: `${d.patientName} · service ${formatDate(claim.dateOfLoss)}` },
              { label: 'Status effective', value: formatDate(claim.updatedAt) },
              { label: 'Total charge', value: money(totals.billed) },
              { label: 'Payment amount', value: claim.payment ? money(claim.payment.amount) : '—' },
              { label: 'Adjudication date', value: claim.decision ? formatDate(claim.decision.decidedAt) : '—' },
            ]}
          />
        </Card>
      )}

      {tab === '835' && (
        <Card className="mt-4" title="Remittance advice / explanation of benefits" icon={Landmark} actions={<Pill tone="blue">835-style</Pill>}>
          {!claim.decision ? (
            <p className="mb-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              No remittance yet: the claim has not been adjudicated. The figures below are projected from the rules engine.
            </p>
          ) : (
            <div className="mb-5">
              <Facts
                items={[
                  { label: 'Claim status', value: <span className="capitalize">{claim.decision.outcome.replace('_', ' ').toLowerCase()}</span> },
                  { label: 'Payee', value: d.provider.name },
                  {
                    label: 'Payment',
                    wide: true,
                    value: claim.payment ? (
                      <>
                        <span className="font-bold tabular-nums">{money(claim.payment.amount)}</span>
                        <span className="block text-xs font-normal text-slate-500">
                          {claim.payment.method.replace('_', ' ').toLowerCase()} · ref <span className="font-mono">{claim.payment.reference}</span> · {formatDate(claim.payment.date)}
                        </span>
                      </>
                    ) : (
                      'Pending'
                    ),
                  },
                ]}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Box label="Billed" value={money(totals.billed)} />
            <Box label="Allowed" value={money(totals.allowed)} />
            <Box label="Plan paid" value={money(totals.planPaid)} tone="good" />
            <Box label="Patient responsibility" value={money(totals.patient)} tone="strong" />
          </div>

          {!staff && (
            <div className="mt-5">
              <CostExplainer key={JSON.stringify(owe)} context={owe} forProvider={role === 'PROVIDER'} projected={!claim.decision} />
            </div>
          )}

          <h3 className="eyebrow mb-3 mt-6">Service line adjudication</h3>
          <table className="hidden w-full text-sm lg:table">
            <caption className="sr-only">Service line adjudication</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-semibold">Service</th>
                <th className="py-2 pr-3 text-right font-semibold">Billed</th>
                <th className="py-2 pr-3 text-right font-semibold">Allowed</th>
                <th className="py-2 pr-3 text-right font-semibold"><GlossaryTerm id="deductible" /></th>
                <th className="py-2 pr-3 text-right font-semibold"><GlossaryTerm id="copay" /></th>
                <th className="py-2 pr-3 text-right font-semibold"><GlossaryTerm id="coinsurance" /></th>
                <th className="py-2 pr-3 text-right font-semibold">Plan paid</th>
                <th className="py-2 text-right font-semibold">Patient resp.</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3">
                    <span className="font-mono text-xs font-semibold text-slate-900">{l.procedureCode}</span> {l.description}
                    {l.remarkCode && <span className="block text-xs text-slate-500">{l.remarkCode}</span>}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">{money(l.billed)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{money(l.allowed)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{money(l.deductible)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{money(l.copay)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">{money(l.coinsurance)}</td>
                  <td className="py-3 pr-3 text-right font-semibold tabular-nums text-emerald-700">{money(l.planPaid)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{money(l.patientResponsibility)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-slate-900">
                <td className="pt-3 pr-3">Totals</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{money(totals.billed)}</td>
                <td className="pt-3 pr-3 text-right tabular-nums">{money(totals.allowed)}</td>
                <td colSpan={3} />
                <td className="pt-3 pr-3 text-right tabular-nums text-emerald-700">{money(totals.planPaid)}</td>
                <td className="pt-3 text-right tabular-nums">{money(totals.patient)}</td>
              </tr>
            </tfoot>
          </table>

          <ul className="space-y-3 lg:hidden" aria-label="Service line adjudication">
            {lines.map((l, i) => (
              <li key={i} className="rounded-xl border border-slate-200 p-3.5">
                <p className="text-sm font-medium text-slate-900">
                  <span className="font-mono text-xs font-semibold">{l.procedureCode}</span> {l.description}
                </p>
                {l.remarkCode && <p className="text-xs text-slate-500">{l.remarkCode}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
                  <Amount label="Billed" value={money(l.billed)} />
                  <Amount label="Allowed" value={money(l.allowed)} />
                  <Amount label="Deductible" value={money(l.deductible)} />
                  <Amount label="Copay" value={money(l.copay)} />
                  <Amount label="Coinsurance" value={money(l.coinsurance)} />
                  <Amount label="Plan paid" value={money(l.planPaid)} className="text-emerald-700" />
                  <Amount label="Patient resp." value={money(l.patientResponsibility)} className="col-span-2 sm:col-span-1" />
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span>
              Provider write-off (billed above allowed, in-network): <strong className="font-semibold text-slate-800">{money(p.contractualAdjustment)}</strong>. The patient is not billed for this amount. {p.notes.filter((n) => !n.startsWith('Provider write-off')).join(' ')}
            </span>
          </p>
        </Card>
      )}
    </div>
  );
}

// ---------- Flow diagram ----------

function Party({ icon: Icon, role, name, detail, active }: { icon: LucideIcon; role: string; name: string; detail: string; active: boolean }) {
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl border p-4', active ? 'border-brand-300 bg-brand-50/70 ring-4 ring-brand-100' : 'border-slate-200 bg-white')}>
      <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500')}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="eyebrow">
          {role}
          {active && <span className="sr-only"> (claim is currently here)</span>}
        </p>
        <p className="break-words text-sm font-semibold leading-snug text-slate-900">{name}</p>
        <p className="break-words text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

/** Two-way link between neighbouring parties: sideways on wide screens, up/down when stacked. */
function Connector({ forward, back }: { forward: string; back: string }) {
  return (
    <div className="flex items-center justify-center gap-6 py-0.5 text-[11px] font-semibold text-slate-500 lg:w-40 lg:flex-col lg:items-stretch lg:gap-2 lg:px-3 lg:py-0" aria-hidden>
      <span className="flex items-center gap-1.5">
        <span>{forward}</span>
        <span className="hidden h-px flex-1 bg-slate-300 lg:block" />
        <ArrowDown className="h-3.5 w-3.5 text-brand-600 lg:hidden" />
        <ArrowRight className="hidden h-3.5 w-3.5 text-brand-600 lg:block" />
      </span>
      <span className="flex items-center gap-1.5">
        <ArrowUp className="h-3.5 w-3.5 text-slate-400 lg:hidden" />
        <ArrowLeft className="hidden h-3.5 w-3.5 text-slate-400 lg:block" />
        <span className="hidden h-px flex-1 bg-slate-200 lg:block" />
        <span>{back}</span>
      </span>
    </div>
  );
}

// ---------- Building blocks ----------

interface Fact {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  wide?: boolean;
}

function Facts({ items }: { items: Fact[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className={cx('min-w-0', it.wide && 'sm:col-span-2')}>
          <dt className="eyebrow">{it.label}</dt>
          <dd className={cx('mt-1 break-words text-sm font-medium text-slate-900', it.mono && 'font-mono')}>{it.value}</dd>
          {it.sub && <dd className="mt-0.5 break-words text-xs text-slate-500">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function Amount({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'strong' }) {
  return (
    <div className={cx('rounded-xl p-4', tone === 'strong' ? 'bg-brand-600 text-white' : 'bg-slate-50 ring-1 ring-inset ring-slate-200/70')}>
      <p className={cx('text-xs font-semibold uppercase tracking-wide', tone === 'strong' ? 'text-brand-100' : 'text-slate-500')}>{label}</p>
      <p className={cx('mt-1 text-xl font-bold tabular-nums', tone === 'good' && 'text-emerald-700')}>{value}</p>
    </div>
  );
}

function LinesTable({ claim, total }: { claim: Claim; total: number }) {
  if (claim.details.kind !== 'HEALTH') return null;
  const lines = claim.details.lines;
  return (
    <>
      <table className="hidden w-full text-sm sm:table">
        <caption className="sr-only">Service lines</caption>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3 font-semibold">Line</th>
            <th className="py-2 pr-3 font-semibold">CPT/HCPCS</th>
            <th className="py-2 pr-3 font-semibold">Dx pointer</th>
            <th className="py-2 pr-3 text-right font-semibold">Units</th>
            <th className="py-2 text-right font-semibold">Charge</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-3 pr-3 text-slate-500">{i + 1}</td>
              <td className="py-3 pr-3">
                <span className="font-mono text-xs font-semibold text-slate-900">{l.procedureCode}</span> {findProcedure(l.procedureCode)?.description}
              </td>
              <td className="py-3 pr-3 font-mono text-xs">{l.diagnosisCode}</td>
              <td className="py-3 pr-3 text-right tabular-nums">{l.units}</td>
              <td className="py-3 text-right font-medium tabular-nums">{money(l.billedAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold text-slate-900">
            <td colSpan={4} className="pt-3 pr-3 text-right">Total charge</td>
            <td className="pt-3 text-right tabular-nums">{money(total)}</td>
          </tr>
        </tfoot>
      </table>

      <ul className="space-y-3 sm:hidden" aria-label="Service lines">
        {lines.map((l, i) => (
          <li key={i} className="rounded-xl border border-slate-200 p-3.5">
            <p className="text-sm font-medium text-slate-900">
              <span className="font-mono text-xs font-semibold">{l.procedureCode}</span> {findProcedure(l.procedureCode)?.description}
            </p>
            <dl className="mt-2.5 grid grid-cols-3 gap-3 text-sm">
              <Amount label="Dx pointer" value={l.diagnosisCode} />
              <Amount label="Units" value={String(l.units)} />
              <Amount label="Charge" value={money(l.billedAmount)} />
            </dl>
          </li>
        ))}
        <li className="flex items-center justify-between px-1 text-sm font-semibold text-slate-900">
          <span>Total charge</span>
          <span className="tabular-nums">{money(total)}</span>
        </li>
      </ul>
    </>
  );
}
