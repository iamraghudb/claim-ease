// Browser-side client for the AI server (server/*, mounted at /api/ai by the Vite dev server).
// The API key never appears here: the browser only ever talks to our own server.

import type {
  AiStatus,
  BriefResult,
  CopilotRequest,
  CopilotResult,
  DraftContext,
  DraftRequest,
  DraftResult,
  ExplainRequest,
  ExplainResult,
  GapCheckResult,
  InsightsRequest,
  InsightsResult,
  IntakeRequest,
  IntakeResult,
  PhotoRequest,
  PhotoResult,
  ScanRequest,
  ScanResult,
  StaffClaimContext,
} from '../domain/aiTypes';
import type { ClaimType } from '../domain/types';

const MAX_FILE_BYTES = 10_000_000;
/** Vision models shrink big images on their side anyway, so sending more only wastes upload time. */
const MAX_IMAGE_EDGE = 1568;
const READABLE = /^(image\/(jpeg|png|webp)|application\/pdf|text\/plain)$/;

/** Photos, PDFs and text files can be read. Video, Word files and HEIC photos cannot. */
export const isScannable = (file: File) => READABLE.test(file.type);

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the AI service. Is `npm run dev` still running?');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : '';
    throw new Error(message || `The AI service returned an error (${res.status}).`);
  }
  // A plain static host answers unknown URLs with the app's HTML page, which is not JSON.
  if (data === null) throw new Error('The AI service is not available in this deployment.');
  return data as T;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(blob);
  });
}

/** Shrinks big phone photos before upload (a 6 MB photo becomes ~300 KB). Small images are sent untouched. */
async function prepareImage(file: File): Promise<{ data: string; mimeType: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Could not open "${file.name}" as an image.`);
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 3_000_000) {
    bitmap.close();
    return { data: await toBase64(file), mimeType: file.type };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error(`Could not prepare "${file.name}" for reading.`);
  return { data: await toBase64(blob), mimeType: 'image/jpeg' };
}

async function toScanDocument(file: File): Promise<ScanRequest['documents'][number]> {
  if (file.size > MAX_FILE_BYTES && !file.type.startsWith('image/')) throw new Error(`"${file.name}" is larger than 10 MB. Try a smaller file.`);
  const prepared = file.type.startsWith('image/') ? await prepareImage(file) : { data: await toBase64(file), mimeType: file.type };
  return { fileName: file.name, ...prepared };
}

export const aiService = {
  /** null = the AI server is not there (for example a static deployment): the UI hides the AI features. */
  async status(): Promise<AiStatus | null> {
    try {
      return await request<AiStatus>('GET', 'status');
    } catch {
      return null;
    }
  },

  async scan(claimType: ClaimType | 'UNKNOWN', files: File[]): Promise<ScanResult> {
    const documents = await Promise.all(files.map(toScanDocument));
    return request<ScanResult>('POST', 'scan', { claimType, documents } satisfies ScanRequest);
  },

  gaps: (context: DraftContext) => request<GapCheckResult>('POST', 'gaps', { context }),

  explain: (req: ExplainRequest) => request<ExplainResult>('POST', 'explain', req),

  /** Ease, the copilot: answers a question about the screen the person is on. */
  chat: (req: CopilotRequest) => request<CopilotResult>('POST', 'chat', req),
  /** Smart start: one turn of the "tell Ease what happened" conversation. */
  intake: (req: IntakeRequest) => request<IntakeResult>('POST', 'intake', req),
  /** The adjuster's one-glance claim brief. */
  brief: (context: StaffClaimContext) => request<BriefResult>('POST', 'brief', { context }),
  /** A drafted letter or message for the person to edit. */
  draft: (req: DraftRequest) => request<DraftResult>('POST', 'draft', req),
  /** Narrated dashboard insights for the admin, optionally answering a question. */
  insights: (req: InsightsRequest) => request<InsightsResult>('POST', 'insights', req),
  /** Feedback on claim photos (quality, what is visible, which shots are missing). */
  async photo(claimType: ClaimType, files: File[]): Promise<PhotoResult> {
    const photos = await Promise.all(files.map(toScanDocument));
    return request<PhotoResult>('POST', 'photo', { claimType, photos } satisfies PhotoRequest);
  },
};
