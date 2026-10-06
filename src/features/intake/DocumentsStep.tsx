import { Camera, Check } from 'lucide-react';
import { requiredDocumentCategories } from '../../domain/requirements';
import { DOCUMENT_CATEGORY_LABELS } from '../../domain/catalog';
import { FileUploader } from '../../components/Documents';
import { cx } from '../../components/ui';
import { draftDetails, type IntakeDraft } from './draft';

const PHOTO_TIPS: Record<string, string[]> = {
  AUTO: ['All four corners of the vehicle', 'Close-ups of every damaged area', 'The other vehicle and its plate', 'The scene, road and traffic signals'],
  PROPERTY: ['A wide shot of each affected room', 'Close-ups of damage and the source (e.g. pipe, roof)', 'Damaged items before you throw them away', 'A short walk-through video'],
  HEALTH: ['Itemized bill (CMS-1500 or UB-04)', 'Clinical notes supporting medical necessity', 'Referral or prior authorization, if any'],
};

export function DocumentsStep({ draft, setDraft }: { draft: IntakeDraft; setDraft: (d: IntakeDraft) => void }) {
  const needed = requiredDocumentCategories(draft.claimType, draftDetails(draft));
  const have = new Set(draft.documents.map((d) => d.category));
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Upload documents</h2>
        <p className="text-sm text-slate-600">Submitting everything together lets an adjuster start right away. Uploads are simulated in this demo: only file names and image previews are kept.</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Documents for this claim type">
        {needed.map((n) => {
          const ok = have.has(n.category);
          return (
            <li key={n.category} className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white')}>
              <span className={cx('flex h-5 w-5 items-center justify-center rounded-full', ok ? 'bg-emerald-600 text-white' : 'border border-slate-300')}>{ok && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
              <span className="flex-1">
                {n.label}
                <span className="sr-only">{ok ? ' — uploaded' : ' — not yet uploaded'}</span>
              </span>
              <span className={cx('text-xs font-medium', n.required ? 'text-red-600' : 'text-slate-500')}>{n.required ? 'Required' : 'Recommended'}</span>
            </li>
          );
        })}
      </ul>

      <FileUploader value={draft.documents} onChange={(documents) => setDraft({ ...draft, documents })} defaultCategory={draft.claimType === 'HEALTH' ? 'INVOICE' : 'PHOTO'} />

      <div className="rounded-lg bg-slate-50 p-3">
        <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-800">
          <Camera className="h-4 w-4 text-brand-600" aria-hidden /> {draft.claimType === 'HEALTH' ? 'What to include' : 'Photo checklist'}
        </p>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-slate-600 sm:grid-cols-2">
          {PHOTO_TIPS[draft.claimType].map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-slate-500">Tip: label each file with its type ({Object.values(DOCUMENT_CATEGORY_LABELS).slice(0, 4).join(', ')}…) so it counts toward your readiness score.</p>
    </div>
  );
}
