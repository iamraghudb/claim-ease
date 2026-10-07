import { useLocation, useNavigate } from 'react-router-dom';
import { Play, Route, ScanText, ShieldCheck, Upload } from 'lucide-react';
import type { Role } from '../../domain/types';
import { PERSONAS } from '../../services';
import { useAppStore } from '../../store/appStore';
import { EaseAvatar } from '../../components/ai';
import { Avatar, Button } from '../../components/ui';
import { startTour } from '../tour/tourStore';
import { WELCOME_PERSONAS } from './content';
import { markWelcomed } from './flags';
import { HOME_FOR_ROLE } from './roleHome';

const HOW_IT_WORKS = [
  { icon: Upload, label: 'Upload a bill' },
  { icon: ScanText, label: 'Ease fills in the claim' },
  { icon: Route, label: 'Track it live' },
];

/** Where "Skip" should go: back to the page that sent you here, if there was one. */
function returnPath(state: unknown): string | null {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('/welcome') ? from : null;
}

/** The first screen a new visitor sees: what ClaimEase does, and a choice of who to be for the demo. */
export default function Welcome() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);

  const choose = (who: Role, withTour: boolean) => {
    setRole(who);
    markWelcomed();
    navigate(HOME_FOR_ROLE[who]);
    if (withTour) startTour(who);
  };

  const skip = () => {
    markWelcomed();
    navigate(returnPath(state) ?? HOME_FOR_ROLE[role]);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-100/80 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-[26rem] w-[26rem] rounded-full bg-ai-100/70 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-brand-50 blur-3xl" aria-hidden />

      <main id="main" className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 sm:py-12">
        <header className="rise flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">ClaimEase</span>
        </header>

        <section className="mx-auto mt-10 max-w-3xl text-center sm:mt-16" aria-labelledby="welcome-title">
          <p className="rise inline-flex items-center gap-2 rounded-full bg-white/80 py-1 pl-1.5 pr-3.5 text-xs font-semibold text-ai-700 shadow-soft ring-1 ring-ai-100" style={{ animationDelay: '60ms' }}>
            <EaseAvatar size="xs" /> Meet Ease, your claims guide
          </p>
          <h1 id="welcome-title" className="rise mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl" style={{ animationDelay: '120ms' }}>
            Claims,
            <span className="block bg-gradient-to-r from-brand-600 to-ai-600 bg-clip-text text-transparent">made clear.</span>
          </h1>
          <p className="rise mx-auto mt-5 max-w-xl text-base text-slate-600 sm:text-lg" style={{ animationDelay: '180ms' }}>
            Upload a bill and Ease fills in the claim for you. Then track it live, from the first step to the payment.
          </p>
          <ol className="rise mt-6 flex flex-wrap items-center justify-center gap-2.5" aria-label="How it works" style={{ animationDelay: '240ms' }}>
            {HOW_IT_WORKS.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <s.icon className="h-4 w-4 text-brand-600" aria-hidden /> {s.label}
                </span>
                {i < HOW_IT_WORKS.length - 1 && (
                  <span className="hidden text-slate-300 sm:inline" aria-hidden>
                    &rarr;
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 sm:mt-16" aria-labelledby="who-title">
          <div className="rise text-center" style={{ animationDelay: '300ms' }}>
            <h2 id="who-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Who are you today?
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 sm:text-base">Pick a person to see ClaimEase through their eyes. Each one sees something different.</p>
          </div>

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {WELCOME_PERSONAS.map((p, i) => {
              const name = PERSONAS[p.role].name;
              return (
                <li key={p.role} className="pop-in flex" style={{ animationDelay: `${360 + i * 80}ms` }}>
                  <article className="card card-hover flex w-full flex-col p-5" aria-label={`${name}, ${p.roleLabel}`}>
                    <div className="flex items-center gap-3">
                      <Avatar name={name} tone={p.tone} size="lg" />
                      <div className="min-w-0 leading-tight">
                        <h3 className="truncate text-base font-bold text-slate-900">{name}</h3>
                        <p className="mt-0.5 text-sm text-slate-500">{p.roleLabel}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-lg font-bold leading-snug text-slate-900">&ldquo;{p.story}&rdquo;</p>
                    <div className="mt-3 flex-1">
                      <p className="eyebrow">What you will see</p>
                      <p className="mt-1 text-sm text-slate-600">{p.sees}</p>
                    </div>
                    <div className="mt-5 space-y-2">
                      <Button className="w-full" onClick={() => choose(p.role, false)}>
                        Start as {p.short}
                      </Button>
                      <Button variant="secondary" icon={Play} className="w-full" onClick={() => choose(p.role, true)}>
                        Take the 60-second tour
                      </Button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="rise mt-10 flex flex-col items-center gap-2 pb-4 text-center" style={{ animationDelay: '700ms' }}>
          <button type="button" onClick={skip} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 underline-offset-4 transition hover:text-slate-900 hover:underline">
            Skip, I&apos;ll explore
          </button>
          <p className="text-xs text-slate-500">You can switch persona any time from the profile menu.</p>
        </footer>
      </main>
    </div>
  );
}
