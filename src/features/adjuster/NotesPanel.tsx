import { useState } from 'react';
import { Lock, MessageSquarePlus, StickyNote } from 'lucide-react';
import type { Claim } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaimAction } from '../../store/useClaimAction';
import { formatDateTime } from '../../components/format';
import { Avatar, Button, Card, EmptyState, Pill } from '../../components/ui';

export function NotesPanel({ claim }: { claim: Claim }) {
  const actor = useAppStore((s) => s.actor);
  const { run, pending } = useClaimAction();
  const [text, setText] = useState('');
  return (
    <Card
      title="Internal notes"
      icon={StickyNote}
      actions={
        <Pill tone="slate">
          <Lock className="h-3 w-3" aria-hidden /> Not visible to claimant
        </Pill>
      }
    >
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
        <textarea id="note-text" rows={3} className="input" placeholder="Add a note for the file…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2.5 flex justify-end">
          <Button type="submit" size="sm" icon={MessageSquarePlus} disabled={!text.trim()} loading={pending === 'note'}>
            Add note
          </Button>
        </div>
      </form>

      <div className="mt-5">
        {claim.notes.length === 0 ? (
          <EmptyState icon={StickyNote} title="No notes yet" message="Jot down calls, findings or reminders. Only your team sees them." />
        ) : (
          <ul className="space-y-3">
            {[...claim.notes].reverse().map((n) => (
              <li key={n.id} className="flex gap-3">
                <Avatar name={n.author} size="sm" tone="slate" />
                <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200/70">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">{n.author}</span>
                    <span>{formatDateTime(n.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{n.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
