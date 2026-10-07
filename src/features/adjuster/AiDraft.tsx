import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { DraftRequest, DraftResult } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAiStatus } from '../../store/useAiStatus';
import { AiBadge } from '../../components/AiBadge';
import { AiThinking, EaseAvatar, Typewriter } from '../../components/ai';
import { Button } from '../../components/ui';

type Phase = 'idle' | 'loading' | 'ready' | 'replace';

/**
 * "Draft with Ease" for a text field. Ease writes a draft and shows it as a preview: nothing reaches the field
 * until the person chooses "Use this draft", and a field that already has text asks before it is replaced.
 * Renders nothing when there is no AI server.
 *
 * `request` is called when the button is pressed, so the draft always reflects what is on the form at that moment.
 * `current` is what the field holds now (pass an empty string for text that is only a starting template).
 */
export function AiDraftAssist({ label = 'Draft with Ease', request, current, onUse, disabled, hint }: {
  label?: string;
  request: () => DraftRequest;
  current: string;
  onUse: (text: string) => void;
  disabled?: boolean;
  /** Shown next to the button, e.g. why it is disabled. */
  hint?: string;
}) {
  const status = useAiStatus();
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<DraftResult>();
  const [error, setError] = useState('');
  const latest = useRef(0);

  // A draft that arrives after the person has moved on (or left) is ignored.
  useEffect(
    () => () => {
      latest.current++;
    },
    [],
  );

  if (!status) return null;

  async function ask() {
    const mine = ++latest.current;
    setPhase('loading');
    setError('');
    try {
      const res = await aiService.draft(request());
      if (latest.current !== mine) return;
      setDraft(res);
      setPhase('ready');
    } catch (e) {
      if (latest.current !== mine) return;
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPhase('idle');
    }
  }

  function close() {
    latest.current++;
    setPhase('idle');
    setDraft(undefined);
  }

  function use() {
    if (!draft) return;
    if (phase === 'ready' && current.trim()) {
      setPhase('replace');
      return;
    }
    onUse(draft.text.trim());
    close();
  }

  const showing = (phase === 'ready' || phase === 'replace') && draft;

  return (
    <div className="mt-2.5">
      {!showing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button size="sm" variant="ai" icon={Sparkles} onClick={() => void ask()} loading={phase === 'loading'} disabled={disabled}>
            {label}
          </Button>
          {hint && <span className="text-xs text-slate-500">{hint}</span>}
        </div>
      )}

      {phase === 'loading' && (
        <div className="ai-surface mt-3 p-4">
          <AiThinking steps={['Ease is writing a draft…', 'Choosing plain words…']} lines={2} />
        </div>
      )}

      {error && phase === 'idle' && (
        <p className="mt-2 text-sm text-slate-600" role="alert">
          Ease could not write a draft just now. {error}
        </p>
      )}

      {showing && (
        <section className="ai-surface p-4" aria-label="Draft from Ease">
          <div className="flex flex-wrap items-center gap-2">
            <EaseAvatar size="xs" />
            <h4 className="text-sm font-bold text-slate-900">Draft from Ease</h4>
            <AiBadge source={draft.source} />
          </div>
          <div className="mt-2.5 rounded-xl bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-800 ring-1 ring-ai-200">
            <Typewriter text={draft.text} charsPerSecond={400} />
          </div>
          <p className="mt-2 text-xs text-slate-500">This is an AI draft. Read it and edit it before you use it.</p>
          {phase === 'replace' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="mr-1 w-full text-sm font-medium text-slate-800 sm:w-auto">This replaces what you have written. Replace it?</p>
              <Button size="sm" onClick={use}>
                Replace my text
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Keep my text
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={use}>
                Use this draft
              </Button>
              <Button size="sm" variant="ghost" onClick={close}>
                Dismiss
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
