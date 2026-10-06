import { useState } from 'react';
import { StickyNote } from 'lucide-react';
import type { Claim } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { formatDateTime } from '../../components/format';
import { Button, Card } from '../../components/ui';

export function NotesPanel({ claim }: { claim: Claim }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [text, setText] = useState('');
  return (
    <Card title="Internal notes" icon={StickyNote} actions={<span className="text-xs text-slate-500">Not visible to claimant</span>}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run('note', () => claimService.addNote(claim.claimNumber, text, actor), 'Note added');
          if (ok) setText('');
        }}
      >
        <label htmlFor="note-text" className="sr-only">
          New note
        </label>
        <textarea id="note-text" rows={2} className="input" placeholder="Add a note for the file…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={!text.trim()} loading={pending === 'note'}>
            Add note
          </Button>
        </div>
      </form>
      {claim.notes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {[...claim.notes].reverse().map((n) => (
            <li key={n.id} className="rounded-lg bg-yellow-50 p-2.5 text-sm ring-1 ring-yellow-200">
              <p className="text-slate-800">{n.text}</p>
              <p className="mt-1 text-xs text-slate-500">
                {n.author} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
