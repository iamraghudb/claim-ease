import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, RotateCcw, Send, X } from 'lucide-react';
import { PERSONAS } from '../../services';
import { useAppStore } from '../../store/appStore';
import { AiBadge } from '../../components/AiBadge';
import { AiThinking, EaseAvatar, Typewriter } from '../../components/ai';
import { Alert, cx } from '../../components/ui';
import { useCopilotStore, type CopilotTurn } from './copilotStore';
import { GENERIC_SUGGESTIONS } from './pages';

/** The "Ask Ease" side panel: a conversation that knows which screen the person is on. */
export function CopilotPanel() {
  const { open, turns, busy, error, specific, fallback, setOpen, ask, reset, markShown } = useCopilotStore();
  const role = useAppStore((s) => s.role);
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const page = specific ?? fallback;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => field.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);

  if (!open || !page) return null;

  const firstName = PERSONAS[role].name.replace(/^Dr\.?\s+/i, '').split(' ')[0];
  const suggestions = page.suggestions?.length ? page.suggestions : GENERIC_SUGGESTIONS[role];
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');

  function send(q: string) {
    setInput('');
    void ask(q);
  }

  function go(to: string) {
    navigate(to);
    if (window.innerWidth < 768) setOpen(false); // on a phone the panel covers the page it just opened
  }

  return (
    <>
      <div className="no-print fixed inset-0 z-[54] bg-slate-900/30 md:hidden" onMouseDown={() => setOpen(false)} aria-hidden />
      <aside
        role="dialog"
        aria-label="Ask Ease"
        className="no-print rise fixed inset-x-0 bottom-0 z-[55] flex h-[85vh] flex-col rounded-t-3xl bg-white shadow-pop md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[420px] md:rounded-none md:rounded-l-3xl"
      >
        <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <EaseAvatar size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">Ease</h2>
            <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
              <Eye className="h-3 w-3 shrink-0" aria-hidden /> Looking at: {page.title}
            </p>
          </div>
          {turns.length > 0 && (
            <button type="button" onClick={reset} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Start a new conversation" title="Start over">
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close Ease">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
          {turns.length === 0 && (
            <div className="pop-in">
              <div className="ai-surface p-4">
                <p className="text-sm font-semibold text-slate-900">Hi {firstName}, I&apos;m Ease.</p>
                <p className="mt-1 text-sm text-slate-600">I can see the screen you&apos;re on. Ask me what anything means, what to do next, or where to find something.</p>
              </div>
              <p className="eyebrow mb-2 mt-5">Try asking</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-ai-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-ai-800 shadow-sm transition hover:border-ai-400 hover:bg-ai-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) => (
            <Message key={t.id} turn={t} animate={t.id === lastAssistant?.id && !t.shown} onShown={() => markShown(t.id)} />
          ))}

          {lastAssistant?.shown && !busy && (
            <div className="space-y-2.5 pl-9">
              {lastAssistant.actions?.map((a) => (
                <button key={a.to + a.label} type="button" onClick={() => go(a.to)} className="inline-flex items-center gap-1.5 rounded-xl bg-ai-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ai-700">
                  {a.label} <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              ))}
              {!!lastAssistant.followUps?.length && (
                <div className="flex flex-wrap gap-2">
                  {lastAssistant.followUps.map((f) => (
                    <button key={f} type="button" onClick={() => send(f)} className="rounded-full border border-ai-200 bg-white px-3 py-1.5 text-xs font-semibold text-ai-800 shadow-sm transition hover:border-ai-400 hover:bg-ai-50">
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {busy && <AiThinking steps={['Ease is reading this screen…', 'Working out the best answer…']} lines={2} className="pl-1" />}
          {error && (
            <Alert tone="error" title="Ease couldn't answer">
              {error}
            </Alert>
          )}
          <div ref={bottom} />
        </div>

        <form
          className="border-t border-slate-100 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) send(input);
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white py-1.5 pl-4 pr-1.5 transition focus-within:border-ai-500 focus-within:ring-4 focus-within:ring-ai-100">
            <label htmlFor="ease-input" className="sr-only">
              Ask Ease a question
            </label>
            <input ref={field} id="ease-input" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Ask about this screen…" maxLength={500} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
            <button type="submit" disabled={!input.trim() || busy} className="grid h-9 w-9 place-items-center rounded-xl bg-ai-600 text-white transition hover:bg-ai-700 disabled:bg-ai-600/30" aria-label="Send">
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">Ease can make mistakes. Check anything important.</p>
        </form>
      </aside>
    </>
  );
}

function Message({ turn, animate, onShown }: { turn: CopilotTurn; animate: boolean; onShown: () => void }) {
  if (turn.role === 'user')
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2.5 text-sm text-white">{turn.text}</p>
      </div>
    );
  return (
    <div className="flex items-start gap-2.5">
      <EaseAvatar size="sm" />
      <div className="min-w-0 max-w-[88%]">
        <p className={cx('rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-800')}>
          <Typewriter text={turn.text} instant={!animate} onDone={onShown} />
        </p>
        {turn.source === 'demo' && (
          <span className="mt-1 inline-block">
            <AiBadge source="demo" />
          </span>
        )}
      </div>
    </div>
  );
}
