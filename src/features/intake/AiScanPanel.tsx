import { useMemo, useRef, useState } from 'react';
import { Download, ScanText, Sparkles, TriangleAlert } from 'lucide-react';
import { DOCUMENT_CATEGORY_LABELS } from '../../domain/catalog';
import { aiService, isScannable } from '../../services';
import { useAiStatus } from '../../store/useAiStatus';
import { toast } from '../../store/toastStore';
import { AiBadge } from '../../components/AiBadge';
import { FileUploader } from '../../components/Documents';
import { Alert, Button, cx, Pill } from '../../components/ui';
import { applyChanges, defaultSelection, labelDocuments, proposeChanges, reviewNotes, type ProposedChange } from './aiApply';
import type { IntakeDraft } from './draft';

const MAX_PER_SCAN = 4;

const SAMPLES: Partial<Record<IntakeDraft['claimType'], { href: string; label: string }>> = {
  HEALTH: { href: '/samples/sample-itemized-bill.pdf', label: 'a sample itemized bill' },
  AUTO: { href: '/samples/sample-repair-estimate.png', label: 'a sample repair estimate' },
};

const CONFIDENCE_TONE = { high: 'green', medium: 'amber', low: 'red' } as const;

/**
 * The document uploader. When the AI service is available it also reads what was uploaded and proposes
 * values for the claim form; when it is not, it is a plain uploader and the rest of the app works unchanged.
 */
export function AiScanPanel({ draft, setDraft }: { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void }) {
  const status = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The scan takes a few seconds. This ref always points at the latest draft, so anything the
  // user changes while the AI is reading is not overwritten when the result comes back.
  const latest = useRef(draft);
  latest.current = draft;

  const scan = draft.scan;
  const proposals = useMemo(() => (scan && !scan.applied ? proposeChanges(draft, scan) : []), [draft, scan]);
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(proposals));

  const uploader = <FileUploader value={draft.documents} onChange={(documents) => setDraft({ ...draft, documents })} defaultCategory={draft.claimType === 'HEALTH' ? 'INVOICE' : 'PHOTO'} />;
  if (!status) return uploader;

  const unread = draft.documents.filter((d) => d.file && isScannable(d.file) && !scan?.documents.some((s) => s.fileName === d.fileName));
  const unreadable = draft.documents.filter((d) => d.file && !isScannable(d.file));
  const sample = SAMPLES[draft.claimType];

  async function read() {
    const batch = unread.slice(0, MAX_PER_SCAN);
    setBusy(true);
    setError('');
    try {
      const result = await aiService.scan(
        draft.claimType,
        batch.map((d) => d.file!),
      );
      const { draft: labeled, relabeled } = labelDocuments(latest.current, result);
      const previous = labeled.scan?.documents.filter((p) => !result.documents.some((n) => n.fileName === p.fileName)) ?? [];
      const stored = { ...result, documents: [...previous, ...result.documents], id: String(Date.now()), applied: false };
      setSelected(defaultSelection(proposeChanges(labeled, stored)));
      setDraft({ ...labeled, scan: stored });
      if (relabeled.length) toast.info('Files labelled', relabeled.map((r) => `${r.fileName} → ${DOCUMENT_CATEGORY_LABELS[r.to as keyof typeof DOCUMENT_CATEGORY_LABELS]}`).join(', '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong while reading the documents.');
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!scan) return;
    const result = applyChanges(draft, scan, selected);
    setDraft({ ...result.draft, scan: { ...scan, applied: true, appliedLabels: result.labels } });
    toast.success(`Filled in ${result.labels.length} item${result.labels.length === 1 ? '' : 's'}`, 'You can review each one on the next step.');
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const notes = scan ? [...scan.warnings, ...reviewNotes(draft, scan)] : [];
  const readLabel = busy ? 'Reading…' : unread.length === 0 ? 'Add a file to read' : `Read ${Math.min(unread.length, MAX_PER_SCAN)} document${unread.length === 1 ? '' : 's'}`;

  return (
    <section className="ai-surface p-5 sm:p-6" aria-labelledby="ai-scan-title">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ai-600 text-white shadow-sm">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <h2 id="ai-scan-title" className="text-lg font-bold text-slate-900">
          Upload a bill, estimate or receipt
        </h2>
        <AiBadge source={status.configured ? 'ai' : 'demo'} />
      </div>
      <p className="mt-2 text-sm text-slate-600">Our AI reads it and fills in the claim for you. You check every value before it&apos;s used, and nothing changes until you say so.</p>

      <div className="mt-4">{uploader}</div>

      {sample && (
        <p className="mt-3 text-xs text-slate-500">
          Nothing to hand?{' '}
          <a href={sample.href} download className="inline-flex items-center gap-1 font-semibold text-ai-700 underline decoration-ai-300 underline-offset-4 hover:decoration-ai-600">
            <Download className="h-3 w-3" aria-hidden /> Download {sample.label}
          </a>{' '}
          and drop it in.
        </p>
      )}
      {unreadable.length > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          Can&apos;t read: {unreadable.map((d) => d.fileName).join(', ')}. JPEG, PNG, WebP, PDF and text files work; videos, Word files and iPhone HEIC photos don&apos;t.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="ai" icon={ScanText} onClick={read} loading={busy} disabled={unread.length === 0}>
          {readLabel}
        </Button>
        {unread.length > MAX_PER_SCAN && <span className="text-xs text-slate-500">{MAX_PER_SCAN} at a time. Read again for the rest.</span>}
        {busy && <span className="text-xs text-slate-500">Usually 3 to 15 seconds, longer if Google is busy.</span>}
      </div>
      {status.configured && !scan && <p className="mt-3 text-xs text-slate-500">Files are sent to Google&apos;s Gemini API to be read. Please use sample documents only.</p>}

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="We couldn't read the documents" icon={TriangleAlert}>
            {error} You can still fill the form in by hand.
          </Alert>
        </div>
      )}

      {scan && scan.applied && (
        <div className="mt-4">
          <Alert tone="success" title={scan.appliedLabels?.length ? `Filled in ${scan.appliedLabels.length} item${scan.appliedLabels.length === 1 ? '' : 's'}` : 'No changes made'}>
            {scan.appliedLabels?.length ? 'Look them over on the next step. Anything the AI was unsure about is marked.' : 'Nothing was changed.'}
          </Alert>
        </div>
      )}

      {scan && !scan.applied && (
        <div className="mt-5 space-y-4 border-t border-ai-100 pt-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">What we found</h3>
            <AiBadge source={scan.source} />
          </div>

          <ul className="space-y-1.5 text-sm text-slate-700">
            {scan.documents.map((d) => (
              <li key={d.fileName}>
                <span className="font-semibold">{d.fileName}</span> <span className="text-slate-500">· {DOCUMENT_CATEGORY_LABELS[d.documentType]}</span>
                {d.summary && <span className="block text-xs text-slate-500">{d.summary}</span>}
              </li>
            ))}
          </ul>

          {notes.length > 0 && (
            <Alert tone="warn" title="Worth a second look" icon={TriangleAlert}>
              <ul className="list-disc space-y-1 pl-4">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Alert>
          )}

          {proposals.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing new to fill in: everything the documents show is already on the form, or could not be read.</p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {proposals.map((p) => (
                <ProposalRow key={p.id} p={p} checked={selected.has(p.id)} onChange={(on) => toggle(p.id, on)} />
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="ai" onClick={apply} disabled={selected.size === 0}>
              Fill in {selected.size} item{selected.size === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" onClick={() => setDraft({ ...draft, scan: { ...scan, applied: true } })}>
              Skip
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ProposalRow({ p, checked, onChange }: { p: ProposedChange; checked: boolean; onChange: (on: boolean) => void }) {
  const id = `ai-${p.id.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <li className={cx('flex items-start gap-3 p-3.5', p.blocked && 'bg-slate-50')}>
      <input id={id} type="checkbox" className="mt-1 h-4 w-4 accent-ai-600" checked={checked} disabled={!!p.blocked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{p.label}</span>
          <Pill tone={CONFIDENCE_TONE[p.confidence]}>{p.confidence} confidence</Pill>
        </span>
        <span className="mt-0.5 block break-words text-slate-800">{p.value}</span>
        {p.evidence && <span className="block text-xs text-slate-500">Seen at: {p.evidence}</span>}
        {p.current && <span className="block text-xs text-amber-700">You already entered: {p.current}. Ticking this replaces it.</span>}
        {p.confidence === 'low' && !p.blocked && <span className="block text-xs text-amber-700">Not sure about this one. If you use it, it&apos;s marked so a person double-checks.</span>}
        {p.note && <span className="block text-xs text-amber-700">{p.note}</span>}
        {p.blocked && <span className="block text-xs font-semibold text-red-700">Can&apos;t use this: {p.blocked}.</span>}
      </label>
    </li>
  );
}
