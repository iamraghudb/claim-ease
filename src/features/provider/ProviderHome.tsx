import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, CircleAlert, ClipboardList, Hourglass, Plus, ReceiptText, Sparkles, UserRound, Wallet } from 'lucide-react';
import { PERSONAS } from '../../services';
import { selectVisibleClaims, useAppStore } from '../../store/appStore';
import { useIntakeSeed } from '../../store/intakeSeed';
import { EaseAvatar } from '../../components/ai';
import { StatusBadge } from '../../components/badges';
import { formatDate } from '../../components/format';
import { Avatar, ButtonLink, Card, cx, EmptyState, StatCard } from '../../components/ui';
import { formatUSD } from '../../domain/rulesEngine';
import { NotificationList } from '../claims/NotificationList';
import { draftForPatient } from './patientDraft';
import { practiceStats, recentPatients, STAGE_LABELS, type Stage } from './practice';

const STAGE_BAR: Record<Stage, string> = {
  IN_REVIEW: 'bg-ai-400',
  NEEDS_INFO: 'bg-amber-400',
  APPROVED: 'bg-brand-400',
  PAID: 'bg-emerald-500',
  DENIED: 'bg-rose-400',
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** The doctor's office home: a practice dashboard instead of the one-claim view a patient gets. */
export default function ProviderHome() {
  const state = useAppStore();
  const navigate = useNavigate();
  const persona = PERSONAS.PROVIDER;
  const claims = selectVisibleClaims(state);
  const stats = practiceStats(claims);
  const patients = recentPatients(claims, 5);
  const attention = [...stats.needsInfo, ...stats.denied];
  const recent = [...claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  function billAgain(index: number) {
    useIntakeSeed.getState().seed(draftForPatient(patients[index]), 0);
    navigate('/file/form');
  }

  return (
    <div className="space-y-8">
      <section className="hero-banner p-7 sm:p-10" data-tour="start-claim">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-brand-300/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-ai-300/30 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-100">
              {greeting()}, {persona.name}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{persona.providerName}</h1>
            <p className="mt-2 max-w-xl text-brand-50/90">
              {attention.length > 0
                ? `${attention.length} claim${attention.length === 1 ? ' needs' : 's need'} your attention. ${formatUSD(stats.awaiting)} is approved and on its way.`
                : `Nothing is waiting on you. ${formatUSD(stats.awaiting)} is approved and on its way.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/file/smart"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-800 shadow-lift transition hover:-translate-y-0.5 hover:bg-brand-50 active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4 text-ai-600" aria-hidden /> Tell Ease about a visit
            </Link>
            <Link
              to="/file/form"
              className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-bold text-white ring-1 ring-inset ring-white/40 backdrop-blur transition hover:bg-white/25 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" aria-hidden /> New claim form
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Practice at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Billed" value={formatUSD(stats.billed)} hint={`${stats.claims} claim${stats.claims === 1 ? '' : 's'} submitted`} icon={ReceiptText} />
        <StatCard label="Approved, awaiting payment" value={formatUSD(stats.awaiting)} hint="On its way to your account" icon={Hourglass} tone="ai" />
        <StatCard label="Paid" value={formatUSD(stats.paid)} hint="Already received" icon={Wallet} tone="emerald" />
        <StatCard label="Needs attention" value={attention.length} hint={attention.length ? 'Info requested or denied' : 'All clear'} icon={CircleAlert} tone={attention.length ? 'amber' : 'emerald'} />
      </section>

      {stats.claims > 0 && (
        <section className="card p-5 sm:p-6" aria-labelledby="pipeline">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pipeline" className="text-sm font-semibold text-slate-900">
              Where your claims are
            </h2>
            <p className="text-xs text-slate-500">{stats.claims} total</p>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={stats.byStage.map((s) => `${s.label}: ${s.count}`).join(', ')}>
            {stats.byStage
              .filter((s) => s.count > 0)
              .map((s) => (
                <span key={s.stage} className={cx('h-full transition-all', STAGE_BAR[s.stage])} style={{ width: `${(s.count / stats.claims) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.byStage.map((s) => (
              <li key={s.stage} className="flex items-start gap-2">
                <span className={cx('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', STAGE_BAR[s.stage])} aria-hidden />
                <span className="min-w-0 text-sm leading-tight">
                  <span className="block font-bold tabular-nums text-slate-900">{s.count}</span>
                  <span className="block truncate text-xs text-slate-500">{STAGE_LABELS[s.stage]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          {attention.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5" aria-labelledby="attention">
              <h2 id="attention" className="flex items-center gap-2 text-base font-bold text-amber-950">
                <CircleAlert className="h-5 w-5 text-amber-600" aria-hidden /> Needs your attention
              </h2>
              <ul className="mt-3 space-y-2">
                {attention.map((c) => (
                  <li key={c.claimNumber}>
                    <Link to={`/claims/${c.claimNumber}`} className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-amber-100 transition hover:ring-amber-300">
                      <span className="font-mono font-semibold text-slate-900">{c.claimNumber}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {c.status === 'INFORMATION_REQUIRED'
                          ? `Upload ${c.informationRequests.at(-1)?.items.filter((i) => !i.fulfilled).map((i) => i.label.toLowerCase()).join(', ') || 'the requested items'}`
                          : 'Denied. Review the reason and decide whether to appeal.'}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                        {c.status === 'INFORMATION_REQUIRED' ? 'Respond' : 'Review'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Card
            title="Recent claims"
            icon={ClipboardList}
            actions={
              <Link to="/claims" className="text-sm font-semibold text-brand-700 hover:underline">
                See all
              </Link>
            }
            bodyClassName="p-2"
          >
            {recent.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No claims yet" message="Drop an itemized bill and Ease will fill in the claim." action={<ButtonLink to="/file">Submit a claim</ButtonLink>} />
            ) : (
              <ul>
                {recent.map((c) => (
                  <li key={c.claimNumber}>
                    <Link to={`/claims/${c.claimNumber}`} className="group flex items-center gap-4 rounded-xl p-3 transition hover:bg-slate-50">
                      <Avatar name={c.details.kind === 'HEALTH' ? c.details.patientName : c.claimantName} tone="sky" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-slate-900">{c.details.kind === 'HEALTH' ? c.details.patientName : c.claimantName}</span>
                          <span className="font-mono text-xs text-slate-500">{c.claimNumber}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">{c.incidentDescription}</p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-sm font-bold tabular-nums text-slate-900">{formatUSD(c.estimatedAmount)}</p>
                        <p className="text-xs text-slate-500">{formatDate(c.dateOfLoss)}</p>
                      </div>
                      <span className="shrink-0">
                        <StatusBadge status={c.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Bill again" icon={UserRound} bodyClassName="p-2">
            {patients.length === 0 ? (
              <p className="p-4 text-sm text-slate-600">Patients you have billed for will show up here, so the next claim starts half done.</p>
            ) : (
              <ul>
                {patients.map((p, i) => (
                  <li key={p.memberId}>
                    <button type="button" onClick={() => billAgain(i)} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-brand-50/60">
                      <Avatar name={p.patientName} tone="teal" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-bold text-slate-900">{p.patientName}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {p.memberId} · last seen {formatDate(p.lastVisit)}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-brand-700 opacity-0 shadow-sm ring-1 ring-brand-200 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                        <Plus className="h-3.5 w-3.5" aria-hidden /> New claim
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section className="ai-surface p-5">
            <div className="flex items-center gap-3">
              <EaseAvatar size="md" />
              <div>
                <p className="eyebrow">Tip from Ease</p>
                <p className="text-sm font-semibold text-slate-900">Drop the itemized bill and skip the typing.</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Ease reads patient, member ID, codes and amounts, and tells you what is missing before you submit.
            </p>
            <Link to="/file/smart" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-ai-700 hover:underline">
              <Banknote className="h-4 w-4" aria-hidden /> Try it with a bill <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>

          <Card title="Recent updates" bodyClassName="p-0">
            <NotificationList limit={4} compact />
          </Card>
        </div>
      </div>
    </div>
  );
}
