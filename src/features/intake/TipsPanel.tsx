import { useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';

export const FASTER_CLAIM_TIPS = [
  { title: 'Give complete and accurate info up front', body: 'Most delays come from follow-up questions. Fill in every field you can.' },
  { title: 'Submit documents together', body: 'Upload photos, estimates and reports in one go so review can start right away.' },
  { title: 'Take clear photos and videos', body: 'Wide shots for context, close-ups for detail, in good light. Include the VIN or address if you can.' },
  { title: 'Keep receipts and estimates', body: 'Receipts for repairs, temporary housing, or tarps can be reimbursed when covered.' },
  { title: 'Respond promptly', body: 'If we ask for something, replying quickly keeps your claim moving.' },
  { title: 'Keep a log of contacts', body: 'Note who you spoke to, when, and what was said. Use the communication log on your claim.' },
  { title: 'Mark estimates clearly', body: 'Not sure of an exact amount or time? Tick "Estimated / unsure" instead of guessing.' },
  { title: 'Keep copies', body: 'Save copies of everything you send, and of your policy declarations page.' },
];

export function TipsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden /> Tips for a faster claim
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ol className="space-y-2.5 border-t border-slate-100 px-4 py-3">
          {FASTER_CLAIM_TIPS.map((t, i) => (
            <li key={t.title} className="flex gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">{i + 1}</span>
              <span>
                <span className="font-medium text-slate-800">{t.title}.</span> <span className="text-slate-600">{t.body}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
