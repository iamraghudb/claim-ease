// Which of the filer's uploads Ease can look at in the photo check, and how its verdicts are labelled.
// Pure, so it is unit-tested.

import type { PhotoFinding, PhotoResult } from '../../domain/aiTypes';
import type { ClaimType } from '../../domain/types';
import type { PendingDoc } from '../../components/Documents';
import { isScannable } from '../../services/aiService';

/** Photos are only checked for claims where a picture tells the story. Health claims are bills, not photos. */
export const PHOTO_CHECK_TYPES: ClaimType[] = ['AUTO', 'PROPERTY'];

/** The server accepts at most four photos per check. */
export const MAX_PHOTOS = 4;

export const isCheckableType = (claimType: ClaimType) => PHOTO_CHECK_TYPES.includes(claimType);

/** A real image file Ease can read (JPEG, PNG or WebP). iPhone HEIC photos and videos are not. */
const isReadablePhoto = (d: PendingDoc): d is PendingDoc & { file: File } => d.file !== undefined && d.file.type.startsWith('image/') && isScannable(d.file);

export interface PhotoSelection {
  /** At most MAX_PHOTOS files, in the order they were added. */
  files: File[];
  /** Readable photos beyond the limit that will not be sent. */
  skipped: number;
  /** Images Ease cannot read (for example HEIC), by name. */
  unreadable: string[];
}

export function selectPhotos(docs: PendingDoc[]): PhotoSelection {
  const readable = docs.filter(isReadablePhoto).map((d) => d.file);
  const unreadable = docs.filter((d) => d.file?.type.startsWith('image/') && !isReadablePhoto(d)).map((d) => d.fileName);
  return { files: readable.slice(0, MAX_PHOTOS), skipped: Math.max(0, readable.length - MAX_PHOTOS), unreadable };
}

/** Names the exact set of photos, so a result can be matched to the photos it was about. */
export const photoKey = (claimType: ClaimType, files: File[]) => [claimType, ...files.map((f) => `${f.name}:${f.size}:${f.lastModified}`)].join('|');

type Tone = 'slate' | 'green' | 'amber' | 'red';

export const SEVERITY_LABEL: Record<PhotoResult['severity'], string> = {
  minor: 'Damage: minor',
  moderate: 'Damage: moderate',
  severe: 'Damage: severe',
  unclear: 'Damage: unclear',
};
export const SEVERITY_TONE: Record<PhotoResult['severity'], Tone> = { minor: 'green', moderate: 'amber', severe: 'red', unclear: 'slate' };

export const QUALITY_LABEL: Record<PhotoFinding['quality'], string> = { good: 'Good quality', ok: 'OK quality', poor: 'Poor quality' };
export const QUALITY_TONE: Record<PhotoFinding['quality'], Tone> = { good: 'green', ok: 'amber', poor: 'red' };
