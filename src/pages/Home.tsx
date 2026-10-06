import { Navigate } from 'react-router-dom';
import { Car, ClipboardList, FilePlus, HeartPulse, House, CircleAlert, Zap, ShieldCheck } from 'lucide-react';
import { selectVisibleClaims, useAppStore } from '../store/appStore';
import { PERSONAS } from '../services';
import { StatusBadge } from '../components/badges';
import { ButtonLink, Card } from '../components/ui';
import { TipsPanel } from '../features/intake/TipsPanel';
import { NotificationList } from '../features/claims/NotificationList';
import { Link } from 'react-router-dom';
import { GlossaryTerm } from '../components/GlossaryTerm';

export default function Home() {
  const state = useAppStore();
  if (state.role === 'ADJUSTER') return <Navigate to="/queue" replace />;
  if (state.role === 'ADMIN') return <Navigate to="/admin" replace />;
  const claims = selectVisibleClaims(state);
  const persona = PERSONAS[state.role];
  const action = claims.filter((c) => c.status === 'INFORMATION_REQUIRED');
  const open = claims.filter((c) => !['CLOSED', 'PAID'].includes(c.status));
  const isProvider = state.role === 'PROVIDER';

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white sm:p-8">
        <p className="text-sm text-brand-100">Welcome back, {persona.name.split(' ')[0] === 'Dr.' ? persona.name : persona.name.split(' ')[0]}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{isProvider ? 'Submit and track health claims' : 'File a claim in minutes, track it in real time'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-brand-100">
          {isProvider
            ? 'Submit claims for your patients, respond to information requests, and view remittance details.'
            : 'Tell us what happened, upload photos from your phone, and see exactly where your claim is. Complete claims are processed faster.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink to="/file" icon={FilePlus} className="bg-white! text-brand-800! hover:bg-brand-50!">
            {isProvider ? 'Submit a claim' : 'Start a claim'}
          </ButtonLink>
          <ButtonLink to="/claims" variant="ghost" icon={ClipboardList} className="text-white! hover:bg-white/10!">
            View {isProvider ? 'submitted' : 'my'} claims
          </ButtonLink>
        </div>
        {!isProvider && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Car, t: 'Auto', d: 'Accidents, theft, glass, weather' },
              { icon: House, t: 'Property', d: 'Homeowners & renters damage' },
              { icon: HeartPulse, t: 'Health', d: 'Usually submitted by your provider' },
            ].map((x) => (
              <div key={x.t} className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                <x.icon className="h-5 w-5" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">{x.t}</p>
                  <p className="text-xs text-brand-100">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {action.length > 0 && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4" aria-labelledby="action-needed">
          <h2 id="action-needed" className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <CircleAlert className="h-5 w-5" aria-hidden /> Action needed on {action.length} claim(s)
          </h2>
          <ul className="mt-2 space-y-1">
            {action.map((c) => (
              <li key={c.claimNumber}>
                <Link className="text-sm font-medium text-amber-900 underline underline-offset-2" to={`/claims/${c.claimNumber}`}>
                  {c.claimNumber}: upload {c.informationRequests.at(-1)?.items.filter((i) => !i.fulfilled).map((i) => i.label.toLowerCase()).join(', ')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title={`Open claims (${open.length})`} icon={ClipboardList} actions={<Link to="/claims" className="text-sm font-medium text-brand-700 hover:underline">See all</Link>}>
            {open.length === 0 ? (
              <p className="text-sm text-slate-500">No open claims.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {open.slice(0, 5).map((c) => (
                  <li key={c.claimNumber}>
                    <Link to={`/claims/${c.claimNumber}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:text-brand-700">
                      <span className="font-mono text-sm font-medium">{c.claimNumber}</span>
                      <StatusBadge status={c.status} />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{c.incidentDescription}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="How ClaimEase speeds things up" icon={Zap}>
            <ul className="grid gap-4 text-sm sm:grid-cols-3">
              <li>
                <p className="font-semibold text-slate-900">Readiness score</p>
                <p className="text-slate-600">See what's missing before you submit, not weeks later.</p>
              </li>
              <li>
                <p className="font-semibold text-slate-900">Honest estimates</p>
                <p className="text-slate-600">Mark values as "estimated / unsure" rather than guessing.</p>
              </li>
              <li>
                <p className="font-semibold text-slate-900">Fast-track</p>
                <p className="text-slate-600">Low-uncertainty claims skip investigation and are decided sooner.</p>
              </li>
            </ul>
            <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4" aria-hidden /> New to insurance terms? Hover terms like <GlossaryTerm id="deductible" /> or <GlossaryTerm id="adjudication" />, or open the <Link to="/glossary" className="underline">glossary</Link>.
            </p>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Recent notifications" bodyClassName="p-0">
            <NotificationList limit={4} compact />
          </Card>
          <TipsPanel />
        </div>
      </div>
    </div>
  );
}
