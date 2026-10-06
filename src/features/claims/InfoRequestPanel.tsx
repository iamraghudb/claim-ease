import { useState } from 'react';
import { Check, CircleAlert, Send } from 'lucide-react';
import type { Claim } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { FileUploader, toDocInputs, type PendingDoc } from '../../components/Documents';
import { formatDate } from '../../components/format';
import { Button, cx, Field } from '../../components/ui';

/** Highlights requested items and lets the filer upload and respond. */
export function InfoRequestPanel({ claim }: { claim: Claim }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [response, setResponse] = useState('');
  const request = [...claim.informationRequests].reverse().find((r) => !r.respondedAt);
  if (claim.status !== 'INFORMATION_REQUIRED' || !request) return null;

  const pendingCategories = new Set(docs.map((d) => d.category));
  const items = request.items.map((i) => ({ ...i, staged: !i.fulfilled && !!i.category && pendingCategories.has(i.category) }));
  const outstanding = items.filter((i) => !i.fulfilled && !i.staged);

  async function upload() {
    const ok = await run('upload', () => claimService.addDocuments(claim.claimNumber, toDocInputs(docs), actor), 'Documents uploaded');
    if (ok) setDocs([]);
  }

  async function submit() {
    if (docs.length) {
      const ok = await run('upload', () => claimService.addDocuments(claim.claimNumber, toDocInputs(docs), actor));
      if (!ok) return;
      setDocs([]);
    }
    await run('submit-info', () => claimService.submitInformation(claim.claimNumber, response, actor), 'Response sent — your claim is back under review');
    setResponse('');
  }

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5" aria-labelledby="info-req-title">
      <h2 id="info-req-title" className="flex items-center gap-2 text-base font-semibold text-amber-950">
        <CircleAlert className="h-5 w-5" aria-hidden /> We need a few more items
      </h2>
      <p className="mt-1 text-sm text-amber-900">
        Requested by {request.requestedBy} on {formatDate(request.requestedAt)}. {request.message}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <li
            key={i.id}
            className={cx(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
              i.fulfilled ? 'border-emerald-200 bg-white text-emerald-800' : i.staged ? 'border-brand-200 bg-white text-brand-800' : 'border-amber-300 bg-white font-medium text-amber-950 ring-2 ring-amber-200',
            )}
          >
            {i.fulfilled ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />}
            <span className="flex-1">{i.label}</span>
            <span className="text-xs">{i.fulfilled ? 'Received' : i.staged ? 'Ready to send' : i.category ? 'Upload needed' : 'Answer below'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-4">
        <FileUploader value={docs} onChange={setDocs} requestItems={request.items} compact defaultCategory={request.items.find((i) => !i.fulfilled && i.category)?.category ?? 'OTHER'} />
        <Field label="Message to your adjuster (optional)" htmlFor="ir-response" hint="Answer any questions that don't need a document.">
          <textarea id="ir-response" rows={2} className="input" value={response} onChange={(e) => setResponse(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {outstanding.length > 0 && <p className="mr-auto text-xs text-amber-900">{outstanding.length} item(s) still outstanding. You can still send what you have.</p>}
          <Button variant="secondary" onClick={upload} disabled={!docs.length} loading={pending === 'upload'}>
            Upload only
          </Button>
          <Button icon={Send} onClick={submit} loading={pending === 'submit-info'} disabled={!docs.length && !response.trim() && items.every((i) => !i.fulfilled)}>
            Submit requested information
          </Button>
        </div>
      </div>
    </section>
  );
}
