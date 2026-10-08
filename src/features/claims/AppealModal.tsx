import { useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { DraftResult } from '../../domain/aiTypes';
import { aiService, claimService } from '../../services';
import type { Claim } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useAiStatus } from '../../store/useAiStatus';
import { useClaimAction } from '../../store/useClaimAction';
import { AiBadge } from '../../components/AiBadge';
import { AiThinking, EaseAvatar } from '../../components/ai';
import { FileUploader, toDocInputs, type PendingDoc } from '../../components/Documents';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Alert, Button, Field, Modal } from '../../components/ui';
import { appealContext } from './easeContext';

const DRAFTING_STEPS = ['Ease is reading your decision…', 'Ease is drafting your letter…'];

export function AppealModal({ claim, open, onClose }: { claim: Claim; open: boolean; onClose: () => void }) {
  const actor = useAppStore((s) => s.actor);
  const aiStatus = useAiStatus();
  const { run, pending } = useClaimAction();
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [error, setError] = useState('');
  // Ease's draft is a preview next to the box, never written into it until the person says so.
  const [draft, setDraft] = useState<DraftResult>();
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState('');
  const latest = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const context = useMemo(() => appealContext(claim), [claim]);

  function discardDraft() {
    latest.current += 1; // anything still on its way back is ignored
    setDraft(undefined);
    setDrafting(false);
    setDraftError('');
  }

  async function helpMeWrite() {
    if (!context || drafting) return;
    const id = ++latest.current;
    setDraft(undefined);
    setDraftError('');
    setDrafting(true);
    try {
      const result = await aiService.draft({ kind: 'appeal_letter', context, notes: reason.trim() || undefined });
      if (id === latest.current) setDraft(result);
    } catch (e) {
      if (id === latest.current) setDraftError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === latest.current) setDrafting(false);
    }
  }

  function adoptLetter() {
    if (!draft) return;
    setReason(draft.text);
    setError('');
    discardDraft();
    setTimeout(() => box.current?.focus(), 0);
  }

  async function submit() {
    if (reason.trim().length < 20) {
      setError('Please explain why you disagree (at least 20 characters).');
      return;
    }
    const ok = await run('appeal', () => claimService.fileAppeal(claim.claimNumber, reason, toDocInputs(docs), actor), 'Appeal filed');
    if (ok) {
      setReason('');
      setDocs([]);
      discardDraft();
      onClose();
    }
  }

  const canDraft = Boolean(aiStatus && context);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`File an appeal · ${claim.claimNumber}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending === 'appeal'}>
            Submit appeal
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          An <GlossaryTerm id="appeal">appeal</GlossaryTerm> asks us to take another look. A different reviewer will look at it. Explain what you think is wrong and attach new evidence, such as a second estimate or records.
        </Alert>
        <Field label="Reason for appeal" htmlFor="appeal-reason" required error={error || undefined}>
          <textarea
            ref={box}
            id="appeal-reason"
            rows={5}
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The rear door dent happened in the same storm. Attached is a dated photo from before the storm showing no dent."
          />
        </Field>

        {canDraft && !draft && !drafting && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="ai" size="sm" icon={Sparkles} onClick={helpMeWrite}>
              Help me write this
            </Button>
            <p className="min-w-0 flex-1 text-xs text-slate-500">Ease turns your own words into a letter you can edit. Nothing is sent until you submit.</p>
          </div>
        )}

        {drafting && (
          <div className="ai-surface p-4 sm:p-5">
            <AiThinking steps={DRAFTING_STEPS} lines={4} />
          </div>
        )}

        {draftError && !drafting && (
          <Alert tone="warn" title="I couldn't draft that just now">
            You can write the letter in your own words, or try again.{' '}
            <button type="button" onClick={helpMeWrite} className="font-semibold underline underline-offset-2">
              Try again
            </button>
          </Alert>
        )}

        {draft && (
          <section className="ai-surface p-4 sm:p-5" aria-labelledby="appeal-draft-title">
            <header className="flex flex-wrap items-center gap-2.5">
              <EaseAvatar size="sm" />
              <h3 id="appeal-draft-title" className="text-sm font-bold text-slate-900">
                Draft from Ease. Read it and make it yours.
              </h3>
              <AiBadge source={draft.source} />
            </header>
            <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line rounded-xl bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm ring-1 ring-slate-200">{draft.text}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="ai" size="sm" onClick={adoptLetter}>
                Use this letter
              </Button>
              <Button variant="ghost" size="sm" onClick={discardDraft}>
                Dismiss
              </Button>
              {reason.trim() && <p className="min-w-0 flex-1 text-xs text-slate-500">Using it replaces what you have written above.</p>}
            </div>
          </section>
        )}

        <div>
          <p className="label">Supporting documents</p>
          <FileUploader value={docs} onChange={setDocs} compact defaultCategory="OTHER" />
        </div>
      </div>
    </Modal>
  );
}
