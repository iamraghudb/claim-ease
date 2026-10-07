import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck, Eye, Lightbulb, Send, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AiSource, DashboardStats, InsightItem } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAiResource } from '../../store/useAiResource';
import { useAiStatus } from '../../store/useAiStatus';
import { AiBadge } from '../../components/AiBadge';
import { AiCard, AiThinking, EaseAvatar, Typewriter } from '../../components/ai';
import { Button, cx } from '../../components/ui';
import { historyFrom, INSIGHT_STARTERS, suggestionLink, type AskedQuestion } from './aiLogic';

const TONES: Record<InsightItem['tone'], { icon: LucideIcon; box: string; label: string }> = {
  good: { icon: CircleCheck, box: 'bg-emerald-50 text-emerald-600', label: 'Going well' },
  watch: { icon: Eye, box: 'bg-amber-50 text-amber-600', label: 'Worth watching' },
  risk: { icon: TriangleAlert, box: 'bg-red-50 text-red-600', label: 'Needs attention' },
};

interface Exchange extends AskedQuestion {
  source: AiSource;
}

/**
 * Ease's read on the operations dashboard: a headline and a few insights that appear by themselves, plus a box
 * to ask the numbers a question. Ease only ever sees the counts in `stats`, never individual claims.
 */
export function AiInsights({ stats }: { stats: DashboardStats }) {
  const status = useAiStatus();
  const statsKey = JSON.stringify(stats);
  const { data, loading, error, refresh } = useAiResource('insights', stats.totalClaims > 0 ? stats : null, () => aiService.insights({ stats }));

  const [thread, setThread] = useState<Exchange[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');
  const statsRef = useRef(statsKey);
  statsRef.current = statsKey;

  // Answers describe the numbers they were asked about. When the numbers change they no longer apply.
  useEffect(() => {
    setThread([]);
    setAskError('');
  }, [statsKey]);

  if (!status || stats.totalClaims === 0) return null;

  async function ask(text: string) {
    const question = text.trim();
    if (!question || asking) return;
    const askedFor = statsRef.current;
    setAsking(true);
    setAskError('');
    setInput('');
    try {
      const res = await aiService.insights({ stats, question, history: historyFrom(thread) });
      if (statsRef.current !== askedFor) return;
      const answer = res.answer.trim() || 'I could not find an answer to that in these numbers.';
      setThread((t) => [...t, { question, answer, source: res.source }]);
    } catch (e) {
      if (statsRef.current !== askedFor) return;
      setInput(question);
      setAskError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setAsking(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const asked = new Set(thread.map((t) => t.question));
  const chips = INSIGHT_STARTERS.filter((q) => !asked.has(q));

  return (
    <div data-tour="ai-insights">
      <AiCard
        title="Ease's read on operations"
        source={data?.source}
        loading={loading}
        loadingSteps={['Ease is reading the dashboard…', 'Comparing the numbers with your targets…', 'Looking for what slows claims down…']}
        onRefresh={refresh}
      >
        {error && (
          <p className="text-sm text-slate-600" role="alert">
            Ease could not read the numbers just now. {error}{' '}
            <button type="button" onClick={refresh} className="font-semibold text-ai-700 underline hover:text-ai-800">
              Try again
            </button>
          </p>
        )}

        {data && (
          <div className="space-y-4">
            {data.headline && <p className="text-base font-semibold leading-snug text-slate-900">{data.headline}</p>}
            {data.insights.length > 0 && (
              <ul className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                {data.insights.map((item, i) => (
                  <InsightRow key={`${i}-${item.title}`} item={item} />
                ))}
              </ul>
            )}
            {!data.headline && data.insights.length === 0 && <p className="text-sm text-slate-600">Ease has nothing to add to these numbers yet.</p>}
          </div>
        )}

        <div className={cx('border-t border-ai-200/70 pt-4', (data || error) && 'mt-5')}>
          <h3 className="eyebrow text-ai-700">Ask the dashboard</h3>

          {(thread.length > 0 || asking) && (
            <div className="mt-3 space-y-3" aria-live="polite">
              {thread.map((t, i) => (
                <div key={`${i}-${t.question}`} className="space-y-2">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-brand-600 px-3.5 py-2 text-sm text-white">{t.question}</p>
                  <div className="flex items-start gap-2.5">
                    <EaseAvatar size="xs" />
                    <div className="min-w-0 flex-1 rounded-2xl bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200">
                      <Typewriter text={t.answer} instant={i < thread.length - 1} charsPerSecond={220} />
                      <span className="mt-2 block">
                        <AiBadge source={t.source} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {asking && <AiThinking steps={['Ease is looking at the numbers…', 'Putting it in plain words…']} lines={1} />}
            </div>
          )}

          {askError && (
            <p className="mt-3 text-sm text-slate-600" role="alert">
              Ease could not answer just now. {askError}
            </p>
          )}

          {chips.length > 0 && !asking && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  className="rounded-full border border-ai-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ai-800 shadow-sm transition hover:border-ai-400 hover:bg-ai-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
            <label htmlFor="ask-dashboard" className="sr-only">
              Ask Ease about these numbers
            </label>
            <input
              id="ask-dashboard"
              className="input min-w-0"
              placeholder="Ask about delays, risks or what to change…"
              maxLength={500}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button type="submit" variant="ai" icon={Send} loading={asking} disabled={!input.trim()}>
              Ask
            </Button>
          </form>
        </div>
      </AiCard>
    </div>
  );
}

function InsightRow({ item }: { item: InsightItem }) {
  const tone = TONES[item.tone];
  const link = suggestionLink(item.suggestion);
  return (
    <li className="min-w-0 rounded-xl bg-white/80 p-3.5 ring-1 ring-slate-200/80">
      <div className="flex items-start gap-3">
        <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', tone.box)}>
          <tone.icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{tone.label}</span>
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-slate-900">{item.title}</p>
          {item.detail && <p className="mt-0.5 text-sm text-slate-600">{item.detail}</p>}
          {item.suggestion && (
            <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-ai-900">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-600" aria-hidden />
              <span className="min-w-0">{item.suggestion}</span>
            </p>
          )}
          {link && (
            <Link to={link.to} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-ai-700 hover:text-ai-800 hover:underline">
              {link.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
