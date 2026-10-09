import { useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { buildClaimContext } from '../../domain/aiContext';
import type { Claim } from '../../domain/types';
import { aiService } from '../../services';
import { useAiResource } from '../../store/useAiResource';
import { useAiStatus } from '../../store/useAiStatus';
import { AiCard, Typewriter } from '../../components/ai';
import { Button, cx } from '../../components/ui';
import { useCopilotStore } from '../copilot/copilotStore';
import { STANDARD_QUESTION, stableClaimContext } from './easeContext';

/** Answers Ease has already "typed out" in this session. Coming back to the page shows them at once. */
const typed = new Set<string>();

const STEPS = ['Ease is reading your claim…', 'Checking the latest updates…', 'Putting it together…'];

/**
 * "Where you stand": Ease's plain-English summary of one claim, written by itself the first time the page opens
 * and remembered after that. The AI only gets what this page already shows the claimant (see buildClaimContext),
 * and the answer is text only: it cannot change the claim. Anything more goes through the "Ask Ease" panel.
 */
export function EaseSummary({ claim }: { claim: Claim }) {
  const status = useAiStatus();
  // `ctx` is what gets sent; `stableCtx` (no clock, no ticking SLA label) is only the cache key.
  const ctx = useMemo(() => buildClaimContext(claim), [claim]);
  const stableCtx = useMemo(() => stableClaimContext(ctx), [ctx]);
  const { data, loading, error, refresh } = useAiResource('where-you-stand', stableCtx, () => aiService.explain({ context: ctx, question: STANDARD_QUESTION, history: [] }));
  const [shown, setShown] = useState('');

  if (!status) return null;

  const answer = data?.answer.trim() ?? '';
  const ready = answer !== '' && shown === answer;
  const ask = (question: string) => void useCopilotStore.getState().ask(question);

  return (
    <div data-tour="ease-summary">
      <AiCard title="Where you stand" source={data?.source ?? (status.configured ? 'ai' : 'demo')} loading={loading} loadingSteps={STEPS} onRefresh={refresh}>
        {answer ? (
          <>
            <p className="text-[15px] leading-relaxed text-slate-800">
              <Typewriter
                text={answer}
                instant={typed.has(answer)}
                onDone={() => {
                  typed.add(answer);
                  setShown(answer);
                }}
              />
            </p>
            {/* Held back until the answer has been written out, so the buttons do not jump around under the text. */}
            <div className={cx('mt-4 flex flex-wrap items-center gap-2', !ready && 'invisible')} aria-hidden={!ready}>
              {data?.followUps.slice(0, 3).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="max-w-full rounded-full border border-ai-200 bg-white px-3.5 py-1.5 text-left text-xs font-semibold text-ai-800 shadow-sm transition hover:border-ai-400 hover:bg-ai-50"
                >
                  {q}
                </button>
              ))}
              <Button size="sm" variant="ai" icon={MessageCircle} onClick={() => useCopilotStore.getState().setOpen(true)}>
                Ask Ease something else
              </Button>
            </div>
          </>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">I couldn&apos;t read your claim just now. Everything on this page is still up to date. You can try again, or ask me directly.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={refresh}>
                Try again
              </Button>
              <Button size="sm" variant="ai" icon={MessageCircle} onClick={() => useCopilotStore.getState().setOpen(true)}>
                Ask Ease something else
              </Button>
            </div>
          </div>
        ) : null}
      </AiCard>
    </div>
  );
}
