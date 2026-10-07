import { useEffect, useMemo, useState } from 'react';
import { FileText, MessageSquareText, Plus } from 'lucide-react';
import { DELAY_REASON_LABELS, DOCUMENT_CATEGORY_LABELS, INFO_REQUEST_TEMPLATES } from '../../domain/catalog';
import { missingRequiredDocuments } from '../../domain/requirements';
import type { Claim, DelayReason, DocumentCategory } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { Button, cx, Field, Modal, Pill } from '../../components/ui';
import { AiDraftAssist } from './AiDraft';
import { infoRequestDraftRequest } from './draftContext';

interface Item {
  label: string;
  category?: DocumentCategory;
  reason: DelayReason;
  checked: boolean;
}

export function RequestInfoModal({ claim, open, onClose }: { claim: Claim; open: boolean; onClose: () => void }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const missing = useMemo(() => new Set(missingRequiredDocuments(claim).map((m) => m.category)), [claim]);
  const initial = useMemo<Item[]>(() => INFO_REQUEST_TEMPLATES[claim.claimType].map((t) => ({ ...t, checked: !!t.category && missing.has(t.category) })), [claim.claimType, missing]);
  const [items, setItems] = useState<Item[]>(initial);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');
  const starter = `Hi ${claim.claimantName.split(' ')[0]}, to keep your claim moving we need the items below. You can upload them from your claim page.`;

  useEffect(() => {
    if (open) {
      setItems(initial);
      setMessage(starter);
    }
  }, [open, initial, starter]);

  const selected = items.filter((i) => i.checked);

  async function send() {
    const ok = await run(
      'request',
      () => claimService.requestInformation(claim.claimNumber, selected.map(({ label, category, reason }) => ({ label, category, reason })), message, actor),
      'Information requested. Claimant notified',
    );
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request information"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!selected.length} loading={pending === 'request'}>
            Send request ({selected.length})
          </Button>
        </>
      }
    >
      <p className="mb-5 text-sm text-slate-600">
        Choose what you still need from {claim.claimantName}. They are notified straight away and the SLA clock pauses until they respond.
      </p>

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Missing items</span>
          <span className="text-xs font-medium text-slate-500" aria-live="polite">
            {selected.length} of {items.length} selected
          </span>
        </legend>
        <ul className="space-y-2">
          {items.map((i, idx) => {
            const flagged = !!i.category && missing.has(i.category);
            return (
              <li key={`${i.label}-${idx}`}>
                <label
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
                    i.checked ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={i.checked} onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, checked: e.target.checked } : x)))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900">{i.label}</span>
                      {flagged && <Pill tone="red">Flagged missing</Pill>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                      {i.category ? <FileText className="h-3 w-3" aria-hidden /> : <MessageSquareText className="h-3 w-3" aria-hidden />}
                      {i.category ? `Document: ${DOCUMENT_CATEGORY_LABELS[i.category]}` : 'Written answer'} · {DELAY_REASON_LABELS[i.reason]}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="mt-3 flex gap-2">
        <label htmlFor="custom-item" className="sr-only">
          Custom item
        </label>
        <input id="custom-item" className="input" placeholder="Add another item…" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button
          variant="secondary"
          icon={Plus}
          disabled={!custom.trim()}
          onClick={() => {
            setItems([...items, { label: custom.trim(), reason: 'MISSING_INFORMATION', checked: true }]);
            setCustom('');
          }}
        >
          Add
        </Button>
      </div>

      <div className="mt-5">
        <Field label="Message to claimant" htmlFor="ir-message">
          <textarea id="ir-message" rows={3} className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
          <AiDraftAssist
            label="Draft the message with Ease"
            request={() => infoRequestDraftRequest(selected.map((i) => i.label))}
            current={message === starter ? '' : message}
            onUse={setMessage}
            disabled={!selected.length}
            hint={selected.length ? undefined : 'Tick at least one item first.'}
          />
        </Field>
      </div>
    </Modal>
  );
}
