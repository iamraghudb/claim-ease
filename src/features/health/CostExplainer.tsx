import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { DraftResult } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAiStatus } from '../../store/useAiStatus';
import { AiCard, Typewriter } from '../../components/ai';
import { Alert, Button } from '../../components/ui';
import type { CostContext } from './remittance';

const STEPS = ['Ease is looking at your numbers…', 'Working out what the plan covers…', 'Putting it together…'];

/**
 * "Explain what I owe": on request, Ease explains the remittance figures in plain English. It only receives the
 * amounts shown on this screen (see costContext). The parent keys this component on those amounts, so a new
 * figure always starts from a clean slate.
 */
export function CostExplainer({ context, forProvider, projected }: { context: CostContext; forProvider?: boolean; projected?: boolean }) {
  const status = useAiStatus();
  const [result, setResult] = useState<DraftResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);
  if (!status) return null;

  async function explain() {
    const id = ++latest.current;
    setBusy(true);
    setError('');
    try {
      const res = await aiService.draft({ kind: 'cost_explanation', context: { ...context } });
      if (id === latest.current) setResult(res);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }

  const label = forProvider ? 'Explain what the patient owes' : 'Explain what I owe';

  if (!busy && !result) {
    return (
      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="ai" size="sm" icon={Sparkles} onClick={explain}>
            {label}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-slate-500">Ease walks through these numbers step by step.</p>
        </div>
        {error && (
          <Alert tone="warn" title="I couldn't explain that just now">
            The numbers above are unchanged. You can try again in a moment.
          </Alert>
        )}
      </div>
    );
  }

  return (
    <AiCard title={forProvider ? 'What the patient owes' : 'What you owe'} source={result?.source} loading={busy} loadingSteps={STEPS} onRefresh={() => void explain()} className="no-print">
      {result && (
        <>
          <p className="text-[15px] leading-relaxed text-slate-800">
            <Typewriter text={result.text} />
          </p>
          {projected && <p className="mt-3 text-xs text-slate-500">This is based on the projected figures above. Nothing is final until the claim has been decided.</p>}
          {error && (
            <div className="mt-3">
              <Alert tone="warn">I couldn&apos;t refresh that just now. The explanation above still stands.</Alert>
            </div>
          )}
        </>
      )}
    </AiCard>
  );
}
