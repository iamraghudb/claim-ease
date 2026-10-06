import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { DELAY_REASON_LABELS, DOCUMENT_CATEGORY_LABELS, INFO_REQUEST_TEMPLATES } from '../../domain/catalog';
import { missingRequiredDocuments } from '../../domain/requirements';
import type { Claim, DelayReason, DocumentCategory } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { Button, Field, Modal } from '../../components/ui';

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

  useEffect(() => {
    if (open) {
      setItems(initial);
      setMessage(`Hi ${claim.claimantName.split(' ')[0]}, to keep your claim moving we need the items below. You can upload them from your claim page.`);
    }
  }, [open, initial, claim.claimantName]);

  const selected = items.filter((i) => i.checked);

  async function send() {
    const ok = await run(
      'request',
      () => claimService.requestInformation(claim.claimNumber, selected.map(({ label, category, reason }) => ({ label, category, reason })), message, actor),
      'Information requested — claimant notified',
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
      <fieldset>
        <legend className="label">Missing items</legend>
        <ul className="space-y-1.5">
          {items.map((i, idx) => (
            <li key={`${i.label}-${idx}`}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={i.checked} onChange={(e) => setItems(items.map((x, j) => (j === idx ? { ...x, checked: e.target.checked } : x)))} />
                <span className="flex-1">
                  <span className="font-medium text-slate-800">{i.label}</span>
                  <span className="block text-xs text-slate-500">
                    {i.category ? `Document: ${DOCUMENT_CATEGORY_LABELS[i.category]}` : 'Written answer'} · {DELAY_REASON_LABELS[i.reason]}
                    {i.category && missing.has(i.category) && <strong className="ml-1 text-red-600">· flagged missing by rules engine</strong>}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="mt-3 flex gap-2">
        <label htmlFor="custom-item" className="sr-only">
          Custom item
        </label>
        <input id="custom-item" className="input" placeholder="Add a custom item…" value={custom} onChange={(e) => setCustom(e.target.value)} />
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
      <div className="mt-4">
        <Field label="Message to claimant" htmlFor="ir-message">
          <textarea id="ir-message" rows={3} className="input" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
