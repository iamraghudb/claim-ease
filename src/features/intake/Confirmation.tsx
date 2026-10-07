import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bell, Check, ClipboardList, FileText, MessageSquare, Upload, Zap } from 'lucide-react';
import { useClaim, useRules } from '../../store/hooks';
import { SlaBadge, SlaInfo, StatusBadge } from '../../components/badges';
import { formatDateTime } from '../../components/format';
import { ButtonLink, EmptyState } from '../../components/ui';

// ---------- Confetti ----------
// A short celebratory burst when the claim lands. Pure CSS, decorative, and skipped for reduced motion.

const CONFETTI_COLORS = ['bg-brand-400', 'bg-brand-600', 'bg-ai-400', 'bg-ai-600', 'bg-emerald-400', 'bg-amber-400', 'bg-sky-400', 'bg-rose-400'];
const CONFETTI_MS = 1500;

const CONFETTI_CSS = `
@keyframes ce-confetti {
  0% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.5); opacity: 1; animation-timing-function: cubic-bezier(0.1, 0.7, 0.3, 1); }
  30% { transform: translate3d(var(--dx), var(--dy), 0) rotate(calc(var(--rot) * 0.4)) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6); }
  100% { transform: translate3d(calc(var(--dx) * 1.25), calc(var(--dy) + 280px), 0) rotate(var(--rot)); opacity: 0; }
}
.ce-confetti { animation: ce-confetti ${CONFETTI_MS}ms both; }
@media (prefers-reduced-motion: reduce) { .ce-confetti { display: none; } }
`;

/** A small repeatable pseudo-random generator, so the burst looks the same on every render. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const PIECES = (() => {
  const rand = seeded(7);
  return Array.from({ length: 40 }, (_, i) => {
    const angle = -Math.PI / 2 + (rand() - 0.5) * 2.5; // a fan opening upward
    const dist = 90 + rand() * 150;
    return {
      key: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dx: Math.round(Math.cos(angle) * dist),
      dy: Math.round(Math.sin(angle) * dist),
      rot: Math.round((rand() - 0.5) * 900),
      delay: Math.round(rand() * 140),
      w: 6 + Math.round(rand() * 6),
      h: 4 + Math.round(rand() * 5),
      round: rand() > 0.7,
    };
  });
})();

function Confetti() {
  const [show, setShow] = useState(() => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), CONFETTI_MS + 400);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <style>{CONFETTI_CSS}</style>
      <div className="absolute left-1/2 top-[170px]">
        {PIECES.map((p) => (
          <span
            key={p.key}
            className={`ce-confetti absolute left-0 top-0 block ${p.color} ${p.round ? 'rounded-full' : 'rounded-[2px]'}`}
            style={{ width: p.w, height: p.h, animationDelay: `${p.delay}ms`, '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

export default function Confirmation() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const rules = useRules(claim);
  if (!claim || !rules) return <EmptyState icon={FileText} title="Claim not found" action={<Link to="/claims">Back to claims</Link>} />;

  const missing = rules.triggers.filter((t) => t.code === 'MISSING_DATA');
  const steps = [
    { icon: ClipboardList, title: 'Your claim gets a reviewer', body: 'An adjuster, the person reviewing your claim, is assigned. We aim to do this within one business day, and you will get a notification.' },
    {
      icon: Upload,
      title: missing.length ? 'Add anything that is still missing' : 'Keep your documents handy',
      body: missing.length ? missing.map((m) => m.explanation).join(' ') : 'We may still ask for originals or more photos.',
    },
    { icon: MessageSquare, title: 'Note down any calls or emails', body: 'Use the contact log on your claim to keep track of who said what.' },
    { icon: Bell, title: 'Watch for updates', body: 'Changes, requests, decisions and payments show up in your notifications.' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Confetti />
      <section className="card relative overflow-hidden p-8 text-center sm:p-10">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[28rem] -translate-x-1/2 rounded-full bg-emerald-100/70 blur-3xl" aria-hidden />
        <div className="relative">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lift ring-8 ring-emerald-50">
            <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Claim submitted</h1>
          <p className="mt-1.5 text-sm text-slate-600">Received {formatDateTime(claim.createdAt)}. Save this number for your records.</p>
          <p className="mt-5 inline-block rounded-2xl bg-brand-50 px-6 py-3.5 font-mono text-2xl font-extrabold tracking-wider text-brand-800 ring-1 ring-brand-100" aria-label={`Claim number ${claim.claimNumber}`}>
            {claim.claimNumber}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <StatusBadge status={claim.status} />
            <span className="flex items-center gap-1.5">
              <SlaBadge claim={claim} />
              <SlaInfo />
            </span>
            {rules.fastTrackEligible && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                <Zap className="h-3 w-3" aria-hidden /> Eligible for quick review
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="card p-6 sm:p-8" aria-labelledby="next-steps">
        <h2 id="next-steps" className="text-lg font-bold text-slate-900">
          What happens next
        </h2>
        <ol className="mt-5 space-y-5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <s.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  <span className="mr-1.5 text-brand-600">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink to={`/claims/${claim.claimNumber}`} className="px-6">
          Track this claim
        </ButtonLink>
        <ButtonLink to="/claims" variant="secondary">
          All my claims
        </ButtonLink>
      </div>
    </div>
  );
}
