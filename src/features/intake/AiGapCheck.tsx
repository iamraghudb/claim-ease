import { useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert } from 'lucide-react';
import type { DraftContext, GapCheckResult, GapSeverity } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAiStatus } from '../../store/useAiStatus';
import { AiBadge } from '../../components/AiBadge';
import { Alert, Button, Pill } from '../../components/ui';

const SEVERITY = {
  blocker: { label: 'Required', tone: 'red', icon: CircleAlert, color: 'text-red-500' },
  recommended: { label: 'Recommended', tone: 'amber', icon: TriangleAlert, color: 'text-amber-500' },
  heads_up: { label: 'Heads-up', tone: 'blue', icon: Info, color: 'text-brand-600' },
} as const satisfies Record<GapSeverity, { label: string; tone: 'red' | 'amber' | 'blue'; icon: unknown; color: string }>;

/** The AI looks at the whole claim before it is submitted and explains, in plain English, what is missing and why it matters. */
export function AiGapCheck({ context }: { context: DraftContext }) {
  const status = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState<{ result: GapCheckResult; signature: string }>();

  if (!status) return null;

  const signature = JSON.stringify(context);
  const stale = checked !== undefined && checked.signature !== signature;

  async function run() {
    setBusy(true);
    setError('');
    try {
      setChecked({ result: await aiService.gaps(context), signature });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check failed.');
    } finally {
      setBusy(false);
    }
  }

  const result = checked?.result;
  return (
    <section className="ai-surface p-5" aria-labelledby="ai-gap-title">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ai-600 text-white shadow-sm">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h3 id="ai-gap-title" className="text-lg font-bold text-slate-900">
          Check before you submit
        </h3>
        <AiBadge source={result?.source ?? (status.configured ? 'ai' : 'demo')} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        The AI reads your claim the way an examiner would and tells you, in plain English, what is missing and why it matters.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button icon={Sparkles} onClick={run} loading={busy} variant={result ? 'secondary' : 'ai'}>
          {busy ? 'Checking…' : result ? 'Check again' : 'Check my claim'}
        </Button>
        {stale && !busy && <span className="text-xs text-amber-700">You changed your claim since this check.</span>}
      </div>

      {error && (
        <div className="mt-3">
          <Alert tone="error" title="The check didn't work">
            {error} You can still submit.
          </Alert>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <Alert tone={result.readyToSubmit ? 'success' : 'warn'} icon={result.readyToSubmit ? CircleCheck : TriangleAlert} title={result.readyToSubmit ? 'Ready to submit' : 'Not quite ready'}>
            {result.headline}
          </Alert>
          {result.items.length > 0 && (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {result.items.map((item, i) => {
                const s = SEVERITY[item.severity];
                const Icon = s.icon;
                return (
                  <li key={i} className="flex gap-3 p-3 text-sm">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.color}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        {item.title} <Pill tone={s.tone}>{s.label}</Pill>
                      </p>
                      {item.why && <p className="mt-0.5 text-slate-600">{item.why}</p>}
                      {item.action && (
                        <p className="mt-1 flex items-start gap-1.5 text-slate-800">
                          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai-600" aria-hidden /> {item.action}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-slate-500">AI can miss things or get things wrong. The readiness list is the definitive list of what is required.</p>
        </div>
      )}
    </section>
  );
}
