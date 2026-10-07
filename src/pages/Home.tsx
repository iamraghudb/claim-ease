import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, ClipboardList, FilePlus, Route, ScanText, Sparkles, Upload, Wallet } from 'lucide-react';
import { selectVisibleClaims, useAppStore } from '../store/appStore';
import { PERSONAS } from '../services';
import { ClaimProgressBar } from '../components/ClaimProgressBar';
import { EaseAvatar } from '../components/ai';
import { ClaimTypeIcon, StatusBadge } from '../components/badges';
import { ButtonLink, Card, EmptyState, StatCard } from '../components/ui';
import { formatUSD } from '../domain/rulesEngine';
import { NotificationList } from '../features/claims/NotificationList';

/** The three things that happen to a claim. Shown as "How it works", and as the first-claim guide for new users. */
const STEPS = [
  { icon: Upload, title: 'Upload your bill', body: 'Drop in a photo or PDF of the bill, estimate or receipt. Or just tell Ease what happened.' },
  { icon: ScanText, title: 'Ease fills in the claim', body: 'Ease reads it and suggests every value. You check each one before anything is sent.' },
  { icon: Route, title: 'Track it live', body: 'See exactly where your claim is, and what happens next, in plain English.' },
];

function HowItWorks() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="card flex gap-4 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <s.icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Step {i + 1}</p>
            <p className="mt-0.5 font-bold text-slate-900">{s.title}</p>
            <p className="mt-1 text-sm text-slate-600">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** For someone with no claims yet: one clear way to begin, instead of empty lists. */
function StartHere({ isProvider }: { isProvider: boolean }) {
  return (
    <section className="ai-surface p-6 sm:p-8" aria-labelledby="start-here">
      <div className="flex items-center gap-3">
        <EaseAvatar size="md" pulse />
        <div>
          <p className="eyebrow">Start here</p>
          <h2 id="start-here" className="text-lg font-bold text-slate-900 sm:text-xl">
            {isProvider ? 'No claims yet. Here is how to submit your first one.' : 'No claims yet. Here is how to file your first one.'}
          </h2>
        </div>
      </div>
      <div className="mt-6">
        <HowItWorks />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink to="/file" icon={Sparkles} className="px-6 py-3 text-base">
          {isProvider ? 'Tell Ease about the visit' : 'Tell Ease what happened'}
        </ButtonLink>
        <p className="text-sm text-slate-600">Nothing is sent until you have checked it.</p>
      </div>
    </section>
  );
}

/** A decorative preview of the product's hero feature. Purely visual, so hidden from assistive tech. */
function HeroPreview() {
  const rows = [
    { label: 'Patient', value: 'Maria Lopez' },
    { label: 'Member ID', value: 'MBR-778812' },
    { label: '99214 · Office visit', value: '$245.00' },
    { label: '73721 · MRI, right knee', value: '$1,650.00' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-100 via-ai-100 to-transparent opacity-70 blur-2xl" />
      <div className="relative rotate-1 rounded-2xl bg-white p-5 shadow-lift ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Itemized statement</p>
            <p className="text-xs text-slate-500">Lakeside Medical Group</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">PDF</span>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 rounded-xl bg-ai-50/70 px-3 py-2 text-sm ring-1 ring-ai-100">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="flex-1 text-slate-600">{r.label}</span>
              <span className="font-semibold text-slate-900">{r.value}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-sm">
          <span className="font-semibold text-slate-600">Total billed</span>
          <span className="text-base font-extrabold text-slate-900">$1,895.00</span>
        </div>
      </div>
      <span className="absolute -right-3 -top-4 flex -rotate-3 items-center gap-1.5 rounded-full bg-ai-600 px-3 py-1.5 text-xs font-bold text-white shadow-lift">
        <Sparkles className="h-3.5 w-3.5" /> Ease filled in 7 fields
      </span>
      <span className="absolute -bottom-4 -left-3 flex -rotate-2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-lift ring-1 ring-emerald-100">
        <Check className="h-3.5 w-3.5" /> You confirm everything
      </span>
    </div>
  );
}

export default function Home() {
  const state = useAppStore();
  if (state.role === 'ADJUSTER') return <Navigate to="/queue" replace />;
  if (state.role === 'ADMIN') return <Navigate to="/admin" replace />;
  const claims = selectVisibleClaims(state);
  const persona = PERSONAS[state.role];
  const isProvider = state.role === 'PROVIDER';
  const needsAction = claims.filter((c) => c.status === 'INFORMATION_REQUIRED');
  const open = claims.filter((c) => !['CLOSED', 'PAID'].includes(c.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paidTotal = claims.reduce((sum, c) => sum + (c.payment?.amount ?? 0), 0);
  const firstName = persona.name.startsWith('Dr.') ? persona.name : persona.name.split(' ')[0];
  const isNew = claims.length === 0;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-white shadow-soft ring-1 ring-slate-200/70">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-ai-100/60 blur-3xl" aria-hidden />
        <div className="relative grid items-center gap-12 p-7 sm:p-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold text-brand-700">{isNew ? 'Welcome' : 'Welcome back'}, {firstName}</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              Upload a bill.
              <span className="block bg-gradient-to-r from-brand-600 to-ai-600 bg-clip-text text-transparent">Ease fills in the claim.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-600 sm:text-lg">
              {isProvider
                ? 'Tell Ease about the visit, or drop the itemized bill. Ease fills in the service lines and tells you what is missing before you submit. Then follow every claim through to payment.'
                : 'Tell Ease what happened, or drop a photo of the bill. Ease fills in the form and tells you what is missing before you send anything. Then see exactly where your claim stands.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/file" icon={Sparkles} className="px-6 py-3 text-base" data-tour="start-claim">
                {isProvider ? 'Tell Ease about the visit' : 'Tell Ease what happened'}
              </ButtonLink>
              {!isNew && (
                <ButtonLink to="/claims" variant="secondary" icon={ClipboardList} className="px-6 py-3 text-base">
                  My claims
                </ButtonLink>
              )}
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {isNew ? (
        <StartHere isProvider={isProvider} />
      ) : (
        <>
          {needsAction.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5" aria-labelledby="action-needed">
              <h2 id="action-needed" className="flex items-center gap-2 text-base font-bold text-amber-950">
                <CircleAlert className="h-5 w-5 text-amber-600" aria-hidden /> {isProvider ? 'The insurer needs something from you' : 'Your insurer needs something from you'}
              </h2>
              <ul className="mt-3 space-y-2">
                {needsAction.map((c) => (
                  <li key={c.claimNumber}>
                    <Link to={`/claims/${c.claimNumber}`} className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-amber-100 transition hover:ring-amber-300">
                      <span className="font-mono font-semibold text-slate-900">{c.claimNumber}</span>
                      <span className="min-w-0 flex-1 text-slate-700">
                        Upload {c.informationRequests.at(-1)?.items.filter((i) => !i.fulfilled).map((i) => i.label.toLowerCase()).join(', ')}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                        Respond <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="How it works">
            <HowItWorks />
          </section>

          <section aria-label="Your claims at a glance" className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Open claims" value={open.length} hint="Being reviewed or waiting on a decision" icon={ClipboardList} />
            <StatCard label="Need your attention" value={needsAction.length} hint={needsAction.length ? 'The insurer asked for something' : 'Nothing is waiting on you'} icon={CircleAlert} tone={needsAction.length ? 'amber' : 'emerald'} />
            <StatCard label="Paid out" value={formatUSD(paidTotal)} hint="Across all completed claims" icon={Wallet} tone="emerald" />
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card
              title={`Open claims (${open.length})`}
              icon={ClipboardList}
              actions={
                <Link to="/claims" className="text-sm font-semibold text-brand-700 hover:underline">
                  See all
                </Link>
              }
              bodyClassName="p-2"
            >
              {open.length === 0 ? (
                <EmptyState icon={FilePlus} title="No open claims" message="Everything is paid or closed. When you file a new claim, you can follow it here." action={<ButtonLink to="/file">{isProvider ? 'Submit a claim' : 'File a claim'}</ButtonLink>} />
              ) : (
                <ul>
                  {open.slice(0, 5).map((c) => (
                    <li key={c.claimNumber}>
                      <Link to={`/claims/${c.claimNumber}`} className="group flex items-center gap-4 rounded-xl p-3 transition hover:bg-slate-50">
                        <ClaimTypeIcon type={c.claimType} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-900">{c.claimNumber}</span>
                            <StatusBadge status={c.status} />
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-600">{c.incidentDescription}</p>
                          <ClaimProgressBar claim={c} className="mt-2" />
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent updates" bodyClassName="p-0">
              <NotificationList limit={4} compact />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
