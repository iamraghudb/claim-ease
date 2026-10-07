import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, FileText, Image as ImageIcon, Paperclip, Trash2, Video } from 'lucide-react';
import { DOCUMENT_CATEGORY_LABELS } from '../domain/catalog';
import type { ClaimDocument, DocumentCategory, InfoRequestItem } from '../domain/types';
import type { NewDocumentInput } from '../services';
import { formatBytes, formatDate } from './format';
import { cx, EmptyState, Modal } from './ui';

const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[];

function guessCategory(file: File, fallback: DocumentCategory): DocumentCategory {
  if (file.type.startsWith('image/')) return 'PHOTO';
  if (file.type.startsWith('video/')) return 'VIDEO';
  const n = file.name.toLowerCase();
  if (/police|report/.test(n)) return 'POLICE_REPORT';
  if (/estimate|quote/.test(n)) return 'REPAIR_ESTIMATE';
  if (/receipt/.test(n)) return 'RECEIPT';
  if (/invoice|bill|1500|ub-?04/.test(n)) return 'INVOICE';
  if (/record|notes|clinical/.test(n)) return 'MEDICAL_RECORD';
  return fallback;
}

function readPreview(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/')) return Promise.resolve(undefined);
  // Small images become data URLs (survive refresh); larger ones use object URLs.
  if (file.size > 400_000) return Promise.resolve(URL.createObjectURL(file));
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(undefined);
    r.readAsDataURL(file);
  });
}

export interface PendingDoc extends NewDocumentInput {
  key: string;
  /** The real file, kept in memory so the AI scan can read it. Never saved with the claim (see toDocInputs). */
  file?: File;
}

/**
 * Drop zone and file list. Captures file metadata and an image preview only;
 * swap `onChange` consumers to a signed-URL upload when real storage exists.
 */
export function FileUploader({
  value,
  onChange,
  defaultCategory = 'PHOTO',
  requestItems,
  allowedCategories = CATEGORIES,
  compact,
}: {
  value: PendingDoc[];
  onChange: (docs: PendingDoc[]) => void;
  defaultCategory?: DocumentCategory;
  requestItems?: InfoRequestItem[];
  allowedCategories?: DocumentCategory[];
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added: PendingDoc[] = [];
    for (const f of Array.from(files)) {
      let category = guessCategory(f, defaultCategory);
      if (!allowedCategories.includes(category)) category = defaultCategory;
      const match = requestItems?.find((i) => !i.fulfilled && i.category === category);
      added.push({
        key: `${f.name}-${f.size}-${Math.random()}`,
        category,
        fileName: f.name,
        sizeBytes: f.size,
        mimeType: f.type || 'application/octet-stream',
        previewUrl: await readPreview(f),
        satisfiesRequestItemId: match?.id,
        file: f,
      });
    }
    onChange([...value, ...added]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void addFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cx(
          'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/70 hover:border-brand-300 hover:bg-brand-50/40',
        )}
      >
        <span className={cx('mb-3 grid place-items-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200', compact ? 'h-10 w-10' : 'h-12 w-12')}>
          <CloudUpload className={compact ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden />
        </span>
        <p className="text-sm font-semibold text-slate-800">
          Drop files here or{' '}
          <button type="button" className="text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-600" onClick={() => input.current?.click()}>
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-slate-500">Photos, PDFs and text files. On a phone you can take a photo straight from the camera.</p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,.doc,.docx,.txt"
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Files you added">
          {value.map((d) => (
            <li key={d.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <Thumb doc={d} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{d.fileName}</p>
                <p className="text-xs text-slate-500">{formatBytes(d.sizeBytes)}</p>
              </div>
              <label className="sr-only" htmlFor={`cat-${d.key}`}>
                Document type for {d.fileName}
              </label>
              <select
                id={`cat-${d.key}`}
                className="input w-auto py-1.5 text-xs"
                value={d.category}
                onChange={(e) => {
                  const category = e.target.value as DocumentCategory;
                  const match = requestItems?.find((i) => !i.fulfilled && i.category === category);
                  onChange(value.map((x) => (x.key === d.key ? { ...x, category, satisfiesRequestItemId: match?.id } : x)));
                }}
              >
                {allowedCategories.map((c) => (
                  <option key={c} value={c}>
                    {DOCUMENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600" onClick={() => onChange(value.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.fileName}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ doc, size = 'md' }: { doc: Pick<ClaimDocument, 'previewUrl' | 'category' | 'fileName'>; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-11 w-11' : 'h-32 w-full';
  if (doc.previewUrl) return <img src={doc.previewUrl} alt={`Preview of ${doc.fileName}`} className={cx(cls, 'rounded-lg object-cover')} />;
  const Icon = doc.category === 'VIDEO' ? Video : doc.category === 'PHOTO' ? ImageIcon : FileText;
  return (
    <div className={cx(cls, 'grid place-items-center rounded-lg bg-slate-100 text-slate-400')}>
      <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'} aria-hidden />
    </div>
  );
}

export function DocumentGallery({ documents, highlight }: { documents: ClaimDocument[]; highlight?: string[] }) {
  const [open, setOpen] = useState<ClaimDocument | null>(null);
  if (!documents.length) return <EmptyState icon={Paperclip} title="No documents yet" message="Photos, estimates and records you add will appear here." />;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {documents.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setOpen(d)}
              className={cx(
                'group w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lift',
                highlight?.includes(d.id) ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200',
              )}
            >
              <Thumb doc={d} />
              <div className="p-2.5">
                <p className="truncate text-xs font-semibold text-slate-800" title={d.fileName}>
                  {d.fileName}
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  {DOCUMENT_CATEGORY_LABELS[d.category]} · {formatDate(d.uploadedAt)}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.fileName ?? ''} size="lg">
        {open && (
          <div>
            {open.previewUrl ? (
              <img src={open.previewUrl} alt={`Full preview of ${open.fileName}`} className="w-full rounded-xl" />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <FileText className="mb-2 h-10 w-10" aria-hidden />
                <p className="text-sm">No preview available for this file type.</p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="eyebrow">Type</dt>
                <dd className="mt-1 font-medium">{DOCUMENT_CATEGORY_LABELS[open.category]}</dd>
              </div>
              <div>
                <dt className="eyebrow">Size</dt>
                <dd className="mt-1 font-medium">{formatBytes(open.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="eyebrow">Added by</dt>
                <dd className="mt-1 font-medium">{open.uploadedBy}</dd>
              </div>
              <div>
                <dt className="eyebrow">Added</dt>
                <dd className="mt-1 font-medium">{formatDate(open.uploadedAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </>
  );
}

export const toDocInputs = (docs: PendingDoc[]): NewDocumentInput[] => docs.map(({ key: _key, file: _file, ...d }) => d);
