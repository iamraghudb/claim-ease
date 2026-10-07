import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { AiSource } from '../domain/aiTypes';
import { AiBadge } from './AiBadge';
import { cx } from './ui';

// The shared look of "Ease", ClaimEase's AI guide. Everything the AI says or shows uses these pieces,
// so it is recognisable on every screen. See docs/DESIGN.md ("Ease").

const AVATAR_SIZES = { xs: 'h-6 w-6', sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' } as const;
const ICON_SIZES = { xs: 'h-3 w-3', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' } as const;

/** Ease's face: a sparkle on an indigo-to-teal gradient. */
export function EaseAvatar({ size = 'md', pulse }: { size?: keyof typeof AVATAR_SIZES; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-ai-500 via-ai-600 to-brand-600 text-white shadow-sm ring-2 ring-white', AVATAR_SIZES[size], pulse && 'ease-pulse')}
    >
      <Sparkles className={ICON_SIZES[size]} />
    </span>
  );
}

/** What to show while the AI works: a rotating status line and shimmering placeholder text. */
export function AiThinking({ steps = ['Ease is thinking…'], lines = 3, className }: { steps?: string[]; lines?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, [steps.length]);
  const widths = ['100%', '92%', '68%', '84%'];
  return (
    <div className={className} role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-ai-700">
        <EaseAvatar size="xs" /> {steps[i % steps.length]}
      </p>
      {lines > 0 && (
        <div className="mt-3 space-y-2" aria-hidden>
          {Array.from({ length: lines }, (_, n) => (
            <div key={n} className="ai-shimmer h-3 rounded-full" style={{ width: widths[n % widths.length] }} />
          ))}
        </div>
      )}
    </div>
  );
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Reveals text a little at a time, like Ease is writing it. Instant for reduced-motion users or when `instant` is set. */
export function Typewriter({ text, charsPerSecond = 160, instant, onDone, className }: { text: string; charsPerSecond?: number; instant?: boolean; onDone?: () => void; className?: string }) {
  const skip = instant || prefersReducedMotion();
  const [count, setCount] = useState(skip ? text.length : 0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (skip) {
      setCount(text.length);
      done.current?.();
      return;
    }
    setCount(0);
    const start = Date.now();
    // Timer based, not requestAnimationFrame: browsers pause animation frames in a background tab, which would
    // leave the answer half-written and its follow-up buttons hidden.
    const timer = setInterval(() => {
      const n = Math.min(text.length, Math.floor(((Date.now() - start) / 1000) * charsPerSecond));
      setCount(n);
      if (n >= text.length) {
        clearInterval(timer);
        done.current?.();
      }
    }, 30);
    return () => clearInterval(timer);
  }, [text, skip, charsPerSecond]);

  return (
    <span className={cx('whitespace-pre-line', count < text.length && 'type-caret', className)}>
      <span aria-hidden>{text.slice(0, count)}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** A card for anything Ease produces on its own: a brief, a summary, insights. Handles the loading look. */
export function AiCard({
  title,
  source,
  loading,
  loadingSteps,
  onRefresh,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  source?: AiSource;
  loading?: boolean;
  loadingSteps?: string[];
  onRefresh?: () => void;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('ai-surface p-5 sm:p-6', className)} aria-busy={loading}>
      <header className="flex flex-wrap items-center gap-2.5">
        <EaseAvatar size="sm" />
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {source && <AiBadge source={source} />}
        <div className="ml-auto flex items-center gap-1.5">
          {actions}
          {onRefresh && !loading && (
            <button type="button" onClick={onRefresh} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-ai-700" aria-label="Ask Ease again" title="Ask Ease again">
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </header>
      <div className="mt-3">{loading ? <AiThinking steps={loadingSteps} /> : children}</div>
    </section>
  );
}
