import { Camera, Check } from 'lucide-react';
import { requiredDocumentCategories } from '../../domain/requirements';
import { cx } from '../../components/ui';
import { AiScanPanel } from './AiScanPanel';
import { draftDetails, type IntakeDraft } from './draft';
import { PhotoCheck } from './PhotoCheck';

const PHOTO_TIPS: Record<string, string[]> = {
  AUTO: ['All four corners of the vehicle', 'Close-ups of every damaged area', 'The other vehicle and its plate', 'The scene, road and traffic signals'],
  PROPERTY: ['A wide shot of each affected room', 'Close-ups of damage and the source (a pipe, the roof)', 'Damaged items before you throw them away', 'A short walk-through video'],
  HEALTH: ['The itemized bill from the provider', 'Clinical notes that support the treatment', 'A referral or approval from your insurer, if there was one'],
};

export function DocumentsStep({ draft, setDraft }: { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void }) {
  const needed = requiredDocumentCategories(draft.claimType, draftDetails(draft));
  const have = new Set(draft.documents.map((d) => d.category));
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Add your documents</h2>
        <p className="mt-1 text-sm text-slate-600">Upload everything in one go so review can start straight away.</p>
      </div>

      <AiScanPanel draft={draft} setDraft={setDraft} />

      <PhotoCheck draft={draft} />

      <section aria-labelledby="needs-title">
        <h3 id="needs-title" className="eyebrow mb-2.5">
          What this claim usually needs
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {needed.map((n) => {
            const ok = have.has(n.category);
            return (
              <li key={n.category} className={cx('flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm', ok ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-slate-200 bg-white')}>
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full', ok ? 'bg-emerald-600 text-white' : 'border-2 border-slate-300')}>{ok && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
                <span className="flex-1 font-medium">
                  {n.label}
                  <span className="sr-only">{ok ? ' — added' : ' — not added yet'}</span>
                </span>
                <span className={cx('text-xs font-semibold', n.required ? 'text-rose-600' : 'text-slate-400')}>{n.required ? 'Required' : 'Optional'}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-slate-50 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Camera className="h-4 w-4 text-brand-600" aria-hidden /> {draft.claimType === 'HEALTH' ? 'What to include' : 'Photo checklist'}
        </p>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-slate-600 sm:grid-cols-2">
          {PHOTO_TIPS[draft.claimType].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
