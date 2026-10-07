import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EaseAvatar } from '../../components/ai';
import { Button, cx } from '../../components/ui';
import { useAppStore } from '../../store/appStore';
import { HOME_FOR_ROLE } from '../welcome/roleHome';
import { CARD_WIDTH, inflate, placeCard, scrollDelta, SPOT_PAD, type Rect, type Viewport } from './placement';
import { resolveClaimRoute } from './steps';
import { useTourStore } from './tourStore';

/** How long to wait for a step's target to show up (a page may still be loading) before showing a centred card. */
const FIND_TIMEOUT_MS = 2000;
const POLL_MS = 100;
/** Entrance animations and late layout shifts can move a target after we first measured it. */
const REMEASURE_MS = [80, 250, 500, 900];

interface Measured extends Rect {
  radius: number;
}

const readViewport = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The first element carrying this anchor that is actually on screen (a desktop link can be hidden on a phone). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

function measure(el: HTMLElement): Measured {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 };
}

const same = (a: Measured | null, b: Measured) => !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height && a.radius === b.radius;

/** Fixed or sticky things (the header) stay put when the page scrolls, so scrolling would not help. */
function isPinned(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') return true;
  }
  return false;
}

type Phase = 'searching' | 'found' | 'missing';

/** Mounted once in the app shell. Renders nothing until a tour is started. */
export function TourHost() {
  const active = useTourStore((s) => s.active);
  return active ? <TourOverlay /> : null;
}

function TourOverlay() {
  const steps = useTourStore((s) => s.steps);
  const index = useTourStore((s) => s.index);
  const tourRole = useTourStore((s) => s.role);
  const { next, back, skip } = useTourStore.getState();
  const appRole = useAppStore((s) => s.role);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const step = steps[index];
  const last = index === steps.length - 1;

  // The phase belongs to a step. Until the effect below has run for the new step, treat it as still searching so a card never shows at the old step's spot.
  const [resolution, setResolution] = useState<{ id: string; phase: Phase }>({ id: '', phase: 'searching' });
  const phase: Phase = resolution.id === step?.id ? resolution.phase : 'searching';
  const [rect, setRect] = useState<Measured | null>(null);
  const [glide, setGlide] = useState(false);
  const [vp, setVp] = useState<Viewport>(readViewport);
  const [cardHeight, setCardHeight] = useState(210);
  const cardRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  // Switching persona mid-tour would leave the steps describing someone else, so end it.
  useEffect(() => {
    if (tourRole && appRole !== tourRole) skip();
  }, [appRole, tourRole, skip]);

  // Escape ends the tour; the arrow keys move through it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return skip();
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight') finishOrNext();
      if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, last]);

  function finishOrNext() {
    const wasLast = useTourStore.getState().index === useTourStore.getState().steps.length - 1;
    next();
    // A finished tour leaves you somewhere familiar rather than on whichever page its last step visited.
    if (wasLast && tourRole && pathRef.current !== HOME_FOR_ROLE[tourRole]) navigate(HOME_FOR_ROLE[tourRole]);
  }

  // Each step: go to its page, wait for its target, bring it into view and measure it.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const timers: number[] = [];
    let poll = 0;
    targetRef.current = null;

    let needsNavigation = false;
    if (step.route) {
      const dest = resolveClaimRoute(step.route, useAppStore.getState().claims.map((c) => c.claimNumber));
      if (pathRef.current !== dest) {
        needsNavigation = true;
        navigate(dest);
      }
    }
    // Never leave the old spotlight hovering over a page that is being swapped out.
    if (needsNavigation || !step.target) setRect(null);
    setResolution({ id: step.id, phase: 'searching' });

    if (!step.target) {
      setResolution({ id: step.id, phase: 'missing' });
      return;
    }

    const settle = (el: HTMLElement) => {
      targetRef.current = el;
      if (!isPinned(el)) {
        const delta = scrollDelta(el.getBoundingClientRect(), readViewport());
        if (delta) window.scrollBy({ top: delta, behavior: 'instant' });
      }
      setRect(measure(el));
      setVp(readViewport());
      setResolution({ id: step.id, phase: 'found' });
      if (!prefersReducedMotion()) {
        setGlide(true);
        timers.push(window.setTimeout(() => !cancelled && setGlide(false), 400));
      }
      for (const ms of REMEASURE_MS) {
        timers.push(
          window.setTimeout(() => {
            if (cancelled || targetRef.current !== el || !el.isConnected) return;
            const m = measure(el);
            setRect((cur) => (same(cur, m) ? cur : m));
          }, ms),
        );
      }
    };

    const look = () => {
      const el = findTarget(step.target!);
      if (el) settle(el);
      return !!el;
    };

    if (!look()) {
      const started = Date.now();
      poll = window.setInterval(() => {
        if (cancelled) return;
        if (look()) window.clearInterval(poll);
        else if (Date.now() - started > FIND_TIMEOUT_MS) {
          window.clearInterval(poll);
          setResolution({ id: step.id, phase: 'missing' });
        }
      }, POLL_MS);
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // The step is the only trigger: navigating or loading data during the tour must not restart it.
  }, [step]);

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    if (phase !== 'found') return;
    const update = () => {
      setVp((cur) => {
        const v = readViewport();
        return cur.width === v.width && cur.height === v.height ? cur : v;
      });
      const el = targetRef.current;
      if (!el || !el.isConnected) return;
      const m = measure(el);
      setRect((cur) => (same(cur, m) ? cur : m));
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (ro && targetRef.current) ro.observe(targetRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      ro?.disconnect();
    };
  }, [phase, step]);

  // The card is as tall as its text, so measure it to decide where it fits.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && h !== cardHeight) setCardHeight(h);
  });

  // Put the keyboard on "Next" so Enter keeps the tour moving.
  useEffect(() => {
    if (phase === 'searching') return;
    cardRef.current?.querySelector<HTMLElement>('[data-tour-next]')?.focus({ preventScroll: true });
  }, [phase, step]);

  if (!step) return null;

  // The spotlight may briefly belong to the previous step, so it can glide across to the new one.
  const spot = resolution.phase === 'found' && rect ? inflate(rect, SPOT_PAD) : null;
  const placement = placeCard(spot, { width: CARD_WIDTH, height: cardHeight }, vp);

  return (
    <div className="no-print">
      {/* Catches clicks so the page underneath cannot be used (or navigated away from) mid-tour. */}
      <div className={cx('fixed inset-0 z-[80]', !spot && 'bg-slate-900/55')} aria-hidden />
      {spot && rect && (
        <div
          aria-hidden
          className={cx('pointer-events-none fixed z-[80]', glide && 'transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none')}
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: Math.max(10, rect.radius + SPOT_PAD),
            boxShadow: '0 0 0 2px rgba(129, 140, 248, 0.95), 0 0 0 9999px rgba(15, 23, 42, 0.55)',
          }}
        />
      )}
      {phase !== 'searching' && (
        <div
          key={step.id}
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          className="pop-in fixed z-[81] rounded-2xl border border-ai-200 bg-white p-4 shadow-pop sm:p-5"
          style={{ top: placement.top, left: placement.left, width: placement.width }}
        >
          <div className="flex items-start gap-3">
            <EaseAvatar size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ai-700">
                Step {index + 1} of {steps.length}
              </p>
              <h2 id={titleId} className="mt-0.5 text-base font-bold text-slate-900">
                {step.title}
              </h2>
              <p id={bodyId} className="mt-1 text-sm leading-relaxed text-slate-600">
                {step.body}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <ol className="flex items-center gap-1.5" aria-hidden>
              {steps.map((s, i) => (
                <li key={s.id} className={cx('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-ai-600' : i < index ? 'w-1.5 bg-ai-300' : 'w-1.5 bg-slate-200')} />
              ))}
            </ol>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={skip}>
                Skip
              </Button>
              {index > 0 && (
                <Button variant="secondary" size="sm" onClick={back}>
                  Back
                </Button>
              )}
              <Button variant="ai" size="sm" onClick={finishOrNext} data-tour-next>
                {last ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
