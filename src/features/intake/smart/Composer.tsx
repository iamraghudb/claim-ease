import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, Paperclip, Send, Square } from 'lucide-react';
import { cx } from '../../../components/ui';
import { useSpeech } from './useSpeech';

export interface ComposerProps {
  /** Ease is reading or thinking: typing is still fine, sending waits. */
  busy: boolean;
  /** Where the quiet link at the bottom goes: nothing captured yet (a plain link to the form) or carry the claim over. */
  footer: React.ReactNode;
  onSend: (text: string) => void;
  onAttach: (files: File[]) => void;
}

const MAX_HEIGHT = 140;

/** The message box: attach a file, speak, type, send. */
export function Composer({ busy, footer, onSend, onAttach }: ComposerProps) {
  const [value, setValue] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const spokenFrom = useRef('');

  // Interim words appear in the box as they are heard, after whatever was already typed.
  const speech = useSpeech((heard) => setValue([spokenFrom.current, heard].filter(Boolean).join(' ')));

  // Grow with the text, up to a few lines.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  // On a computer, start typing straight away. On a phone the keyboard would cover the conversation.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) field.current?.focus();
  }, []);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    speech.cancel();
    onSend(text);
    setValue('');
  }

  function toggleMic() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    spokenFrom.current = value.trim();
    speech.start();
    field.current?.focus();
  }

  const canSend = value.trim() !== '' && !busy;

  return (
    <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
      {speech.listening && (
        <p className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-rose-700" role="status">
          <span className="flex h-3 items-end gap-0.5" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="w-0.5 rounded-full bg-rose-500 motion-safe:animate-pulse" style={{ height: `${6 + ((i * 5) % 7)}px`, animationDelay: `${i * 120}ms` }} />
            ))}
          </span>
          Listening. Say it, then pause.
        </p>
      )}
      {speech.problem && (
        <p className="mb-2 px-1 text-xs font-medium text-amber-800" role="status">
          {speech.problem}
        </p>
      )}

      <form
        className="flex items-end gap-1.5 rounded-2xl border border-slate-300 bg-white p-1.5 transition focus-within:border-ai-500 focus-within:ring-4 focus-within:ring-ai-100"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/*,application/pdf,text/plain,.pdf,.txt"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a bill, photo or document"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) onAttach(files);
          }}
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={busy}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
          aria-label="Add a bill, photo or document"
          title="Add a bill, photo or document"
        >
          <Paperclip className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <label htmlFor="smart-start-input" className="sr-only">
          Tell Ease what happened
        </label>
        <textarea
          ref={field}
          id="smart-start-input"
          rows={1}
          value={value}
          maxLength={1200}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={speech.listening ? 'Listening…' : busy ? 'Ease is working on it…' : speech.supported ? 'Type it, or tap the mic and say it' : 'Type what happened'}
          className="max-h-[140px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
        />

        {speech.supported && (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? 'Stop listening' : 'Speak instead of typing'}
            title={speech.listening ? 'Stop listening' : 'Speak instead of typing'}
            className={cx(
              'relative grid h-10 w-10 shrink-0 place-items-center rounded-xl transition',
              speech.listening ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            )}
          >
            {speech.listening && <span className="absolute inset-0 rounded-xl bg-rose-400/30 motion-safe:animate-ping" aria-hidden />}
            {speech.listening ? <Square className="relative h-4 w-4 fill-current" aria-hidden /> : <Mic className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        )}

        <button
          type="submit"
          disabled={!canSend}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ai-600 text-white shadow-sm transition hover:bg-ai-700 disabled:bg-ai-600/30 disabled:shadow-none"
          aria-label="Send"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
        <span>Ease can make mistakes. Check anything important.</span>
        {footer}
      </div>
    </div>
  );
}
