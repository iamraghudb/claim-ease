import { useState } from 'react';
import { Check, Clock, Plus, Wrench } from 'lucide-react';
import { EXPERT_TYPES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim, ExpertInput, ExpertType } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { formatDate } from '../../components/format';
import { Button, Card, EmptyState, Field, Modal, Pill } from '../../components/ui';

export function ExpertInputs({ claim, disabled }: { claim: Claim; disabled?: boolean }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [open, setOpen] = useState(false);
  const [completing, setCompleting] = useState<ExpertInput | null>(null);
  const [form, setForm] = useState({ expertType: 'CONTRACTOR' as ExpertType, expertName: '', status: 'RECEIVED' as ExpertInput['status'], summary: '', recommendedAmount: '' });
  const [result, setResult] = useState({ summary: '', recommendedAmount: '' });

  async function save() {
    const ok = await run(
      'expert',
      () =>
        claimService.recordExpertInput(
          claim.claimNumber,
          { expertType: form.expertType, expertName: form.expertName.trim(), status: form.status, summary: form.summary || undefined, recommendedAmount: Number(form.recommendedAmount) || undefined },
          actor,
        ),
      form.status === 'PENDING' ? 'Expert input requested' : 'Expert input recorded',
    );
    if (ok) {
      setOpen(false);
      setForm({ expertType: 'CONTRACTOR', expertName: '', status: 'RECEIVED', summary: '', recommendedAmount: '' });
    }
  }

  async function complete() {
    if (!completing) return;
    const ok = await run('complete', () => claimService.completeExpertInput(claim.claimNumber, completing.id, result.summary, Number(result.recommendedAmount) || undefined, actor), 'Expert input recorded');
    if (ok) {
      setCompleting(null);
      setResult({ summary: '', recommendedAmount: '' });
    }
  }

  const pendingCount = claim.expertInputs.filter((e) => e.status === 'PENDING').length;

  return (
    <Card
      title="External expert input"
      icon={Wrench}
      actions={
        <Button size="sm" variant="secondary" icon={Plus} disabled={disabled} onClick={() => setOpen(true)}>
          Record input
        </Button>
      }
    >
      {claim.expertInputs.length === 0 ? (
        <EmptyState icon={Wrench} title="No expert input yet" message="Engineers, contractors, medical reviewers and repair shops can be recorded here. Pending input adds a third-party review trigger." />
      ) : (
        <>
          {pendingCount > 0 && (
            <p className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {pendingCount} {pendingCount === 1 ? 'result is' : 'results are'} still awaited. This keeps the claim flagged for review.
            </p>
          )}
          <ul className="space-y-3">
            {claim.expertInputs.map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-200 p-3.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{e.expertName}</span>
                  <Pill tone="slate">{EXPERT_TYPES.find((t) => t.value === e.expertType)?.label}</Pill>
                  <Pill tone={e.status === 'PENDING' ? 'amber' : 'green'}>
                    {e.status === 'PENDING' ? <Clock className="h-3 w-3" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                    {e.status === 'PENDING' ? 'Awaiting result' : 'Received'}
                  </Pill>
                  {e.status === 'PENDING' && (
                    <Button size="sm" variant="secondary" className="ml-auto" disabled={disabled} onClick={() => setCompleting(e)}>
                      Record result
                    </Button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Requested {formatDate(e.requestedAt)}
                  {e.receivedAt && ` · received ${formatDate(e.receivedAt)}`}
                </p>
                {e.summary && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-slate-700">{e.summary}</p>}
                {!!e.recommendedAmount && (
                  <p className="mt-2 text-slate-700">
                    Recommended loss: <strong className="tabular-nums text-slate-900">{formatUSD(e.recommendedAmount)}</strong>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record external expert input"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!form.expertName.trim()} loading={pending === 'expert'}>
              Save input
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expert type" htmlFor="ex-type">
            <select id="ex-type" className="input" value={form.expertType} onChange={(e) => setForm({ ...form, expertType: e.target.value as ExpertType })}>
              {EXPERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="ex-status">
            <select id="ex-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExpertInput['status'] })}>
              <option value="RECEIVED">Received (record findings)</option>
              <option value="PENDING">Requested (awaiting)</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Name / firm" htmlFor="ex-name" required>
              <input id="ex-name" className="input" value={form.expertName} onChange={(e) => setForm({ ...form, expertName: e.target.value })} />
            </Field>
          </div>
          {form.status === 'RECEIVED' && (
            <>
              <div className="sm:col-span-2">
                <Field label="Findings" htmlFor="ex-summary">
                  <textarea id="ex-summary" rows={3} className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                </Field>
              </div>
              <Field label="Recommended loss amount" htmlFor="ex-amt">
                <input id="ex-amt" type="number" min={0} className="input" value={form.recommendedAmount} onChange={(e) => setForm({ ...form, recommendedAmount: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!completing}
        onClose={() => setCompleting(null)}
        title={completing ? `Record result from ${completing.expertName}` : 'Record result'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleting(null)}>
              Cancel
            </Button>
            <Button onClick={complete} disabled={!result.summary.trim()} loading={pending === 'complete'}>
              Save result
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Findings" htmlFor="exr-summary" required>
            <textarea id="exr-summary" rows={3} className="input" value={result.summary} onChange={(e) => setResult({ ...result, summary: e.target.value })} />
          </Field>
          <Field label="Recommended loss amount" htmlFor="exr-amt">
            <input id="exr-amt" type="number" min={0} className="input" value={result.recommendedAmount} onChange={(e) => setResult({ ...result, recommendedAmount: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
