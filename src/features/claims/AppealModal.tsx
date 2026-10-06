import { useState } from 'react';
import { claimService } from '../../services';
import type { Claim } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { FileUploader, toDocInputs, type PendingDoc } from '../../components/Documents';
import { GlossaryTerm } from '../../components/GlossaryTerm';
import { Alert, Button, Field, Modal } from '../../components/ui';

export function AppealModal({ claim, open, onClose }: { claim: Claim; open: boolean; onClose: () => void }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [error, setError] = useState('');

  async function submit() {
    if (reason.trim().length < 20) {
      setError('Please explain why you disagree (at least 20 characters).');
      return;
    }
    const ok = await run('appeal', () => claimService.fileAppeal(claim.claimNumber, reason, toDocInputs(docs), actor), 'Appeal filed');
    if (ok) {
      setReason('');
      setDocs([]);
      onClose();
    }
  }

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
          An <GlossaryTerm id="appeal">appeal</GlossaryTerm> asks us to take another look. A different examiner will review it. Explain what you think is wrong and attach new evidence, such as a second estimate or records.
        </Alert>
        <Field label="Reason for appeal" htmlFor="appeal-reason" required error={error || undefined}>
          <textarea id="appeal-reason" rows={5} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The rear door dent happened in the same storm. Attached is a dated photo from before the storm showing no dent." />
        </Field>
        <div>
          <p className="label">Supporting documents</p>
          <FileUploader value={docs} onChange={setDocs} compact defaultCategory="OTHER" />
        </div>
      </div>
    </Modal>
  );
}
