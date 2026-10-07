import type { PendingDoc } from '../../../components/Documents';
import type { DocumentCategory } from '../../../domain/types';

// Turns files picked or dropped in the chat into the same PendingDoc the form's uploader makes, so they show up
// in the form's Documents step unchanged. (Mirrors the uploader's file-name guesses; a scan relabels them afterwards.)

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
  // Small images become data URLs (they survive a refresh); larger ones use object URLs.
  if (file.size > 400_000) return Promise.resolve(URL.createObjectURL(file));
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => resolve(undefined);
    r.readAsDataURL(file);
  });
}

export async function toPendingDocs(files: File[], fallback: DocumentCategory): Promise<PendingDoc[]> {
  return Promise.all(
    files.map(async (f) => ({
      key: `${f.name}-${f.size}-${Math.random()}`,
      category: guessCategory(f, fallback),
      fileName: f.name,
      sizeBytes: f.size,
      mimeType: f.type || 'application/octet-stream',
      previewUrl: await readPreview(f),
      file: f,
    })),
  );
}

/** Same name and size means the same file (picked twice). */
export const sameFile = (a: { fileName: string; sizeBytes: number }, b: { name: string; size: number }) => a.fileName === b.name && a.sizeBytes === b.size;
