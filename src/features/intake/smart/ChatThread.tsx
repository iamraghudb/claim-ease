import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { AiThinking, EaseAvatar, Typewriter } from '../../../components/ai';
import { Button, cx } from '../../../components/ui';
import type { Busy, Turn } from './useSmartStart';

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const THINKING: Record<'scan' | 'turn' | 'verify', { steps: string[]; lines: number }> = {
  scan: { steps: ['Ease is reading your document…', 'Picking out the details…', 'Filling in your claim…'], lines: 3 },
  turn: { steps: ['Ease is reading what you said…', 'Working out what to ask next…'], lines: 2 },
  verify: { steps: ['Ease is checking your policy…'], lines: 1 },
};

export interface ChatThreadProps {
  turns: Turn[];
  busy: Busy;
  verifying: boolean;
  /** The last bubble is a snag with a Retry button. */
  canRetry: boolean;
  /** Everything is captured: show the "Review my claim" button under Ease's last message. */
  ready: boolean;
  onRetry: () => void;
  onQuickReply: (text: string) => void;
  onReview: () => void;
  onContinue: () => void;
}

export function ChatThread({ turns, busy, verifying, canRetry, ready, onRetry, onQuickReply, onReview, onContinue }: ChatThreadProps) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow new messages, unless the person has scrolled up to re-read
  // Ease types each message out once. After that (or for older messages) the text is simply shown.
  const [typed, setTyped] = useState<ReadonlySet<string>>(new Set());
  const markTyped = (id: string) => setTyped((s) => (s.has(id) ? s : new Set(s).add(id)));

  const last = turns[turns.length - 1];
  const lastEase = [...turns].reverse().find((t) => t.from === 'ease' && !t.error);
  const typing = !!lastEase && !typed.has(lastEase.id);
  const settled = !!last && last.from === 'ease' && !last.error && typed.has(last.id);

  const toBottom = (smooth: boolean) => box.current?.scrollTo({ top: box.current.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });

  useEffect(() => {
    stick.current = true;
    toBottom(true);
  }, [turns.length]);
  useEffect(() => {
    if (stick.current) toBottom(true);
  }, [busy, verifying, settled, ready]);
  // While Ease is typing the message grows, so keep its end in view.
  useEffect(() => {
    if (!typing) return;
    const t = setInterval(() => stick.current && toBottom(false), 120);
    return () => clearInterval(t);
  }, [typing]);

  function onScroll() {
    const el = box.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  const thinking = busy ? THINKING[verifying ? 'verify' : busy] : null;
  const opening = turns.length === 1;

  return (
    <div ref={box} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
      {turns.map((t) =>
        t.from === 'user' ? (
          <div key={t.id} className="rise flex justify-end">
            <p className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm [overflow-wrap:anywhere]">{t.text}</p>
          </div>
        ) : (
          <div key={t.id} className="rise flex items-start gap-2.5">
            <EaseAvatar size="sm" />
            <div className="min-w-0 max-w-[88%]">
              <p className={cx('rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-slate-800 [overflow-wrap:anywhere]', t.error ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-ai-50/80 ring-1 ring-ai-100')}>
                {t.error ? t.text : <Typewriter text={t.text} instant={t.id !== lastEase?.id || typed.has(t.id)} onDone={() => markTyped(t.id)} />}
              </p>

              {t.error && t === last && canRetry && !busy && (
                <div className="mt-2">
                  <Button size="sm" variant="secondary" icon={RotateCcw} onClick={onRetry}>
                    Try again
                  </Button>
                </div>
              )}

              {t === last && !t.error && !busy && typed.has(t.id) && !!t.quickReplies?.length && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Quick replies">
                  {t.quickReplies.map((q, i) => (
                    <li key={q} className="pop-in" style={{ animationDelay: `${i * 70}ms` }}>
                      <button
                        type="button"
                        onClick={() => onQuickReply(q)}
                        className="rounded-full border border-ai-200 bg-white px-3.5 py-1.5 text-left text-sm font-semibold text-ai-800 shadow-sm transition hover:border-ai-400 hover:bg-ai-50"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {t === last && opening && typed.has(t.id) && !busy && (
                <p className="pop-in mt-3 text-xs text-slate-500" style={{ animationDelay: '300ms' }}>
                  Prefer a form?{' '}
                  <Link to="/file/form" className="font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-600">
                    Fill it in step by step
                  </Link>
                </p>
              )}
            </div>
          </div>
        ),
      )}

      {thinking && (
        <div className="pl-1">
          <div className="max-w-[min(100%,22rem)] rounded-2xl rounded-tl-md bg-ai-50/80 px-4 py-3 ring-1 ring-ai-100">
            <AiThinking steps={thinking.steps} lines={thinking.lines} />
          </div>
        </div>
      )}

      {ready && settled && !busy && (
        <div className="pop-in flex flex-wrap items-center gap-x-4 gap-y-2 pl-10">
          <Button onClick={onReview}>
            Review my claim <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
          <button type="button" onClick={onContinue} className="text-sm font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-800">
            Continue in the form
          </button>
        </div>
      )}
    </div>
  );
}
