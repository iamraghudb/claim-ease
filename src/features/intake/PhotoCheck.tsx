import { useState } from 'react';
import { Camera, CircleDashed, ImageOff, ScanEye, TriangleAlert } from 'lucide-react';
import type { PhotoResult } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAiStatus } from '../../store/useAiStatus';
import { AiCard, Typewriter } from '../../components/ai';
import { Alert, Button, Pill } from '../../components/ui';
import type { IntakeDraft } from './draft';
import { isCheckableType, photoKey, QUALITY_LABEL, QUALITY_TONE, selectPhotos, SEVERITY_LABEL, SEVERITY_TONE } from './photoSelection';

const STEPS = ['Ease is looking at your photos…', 'Checking light, focus and angles…', 'Thinking about which shots would help…'];

interface Checked {
  /** Which exact photos this result is about (see photoKey). */
  key: string;
  result: PhotoResult;
  /** False when it was restored after moving between steps, so it appears at once instead of being "written" again. */
  fresh: boolean;
}

/** The latest result, kept while the filer moves between wizard steps (this step unmounts). It only comes back for the exact same photos. */
let remembered: { key: string; result: PhotoResult } | undefined;

/**
 * "Check my photos with Ease": on request, Ease looks at the damage photos before the claim is filed and says whether
 * they are clear, what they show and which shots would help. Advice only: it never changes the claim or its readiness score.
 * Shows nothing for health claims, when there is no readable photo yet, or when there is no AI service.
 */
export function PhotoCheck({ draft }: { draft: IntakeDraft }) {
  const status = useAiStatus();
  const { files, skipped, unreadable } = selectPhotos(draft.documents);
  const key = photoKey(draft.claimType, files);
  const [checked, setChecked] = useState<Checked | undefined>(() => (remembered?.key === key ? { ...remembered, fresh: false } : undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!status || !isCheckableType(draft.claimType) || files.length === 0) return null;

  const stale = checked !== undefined && checked.key !== key;
  const previews = new Map(draft.documents.map((d) => [d.fileName, d.previewUrl]));

  async function check() {
    const sentKey = key;
    setBusy(true);
    setError('');
    try {
      const result = await aiService.photo(draft.claimType, files);
      remembered = { key: sentKey, result };
      setChecked({ key: sentKey, result, fresh: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const result = checked?.result;
  return (
    <AiCard title="Photo check" source={result?.source} loading={busy} loadingSteps={STEPS} onRefresh={result ? () => void check() : undefined}>
      {error && (
        <div className="mb-3">
          <Alert tone="warn" title="I couldn't check your photos just now">
            Your claim isn&apos;t affected. {error}
          </Alert>
        </div>
      )}

      {!result ? (
        <>
          <p className="text-sm text-slate-700">
            Want a second pair of eyes before you submit? I&apos;ll look at your photos and tell you if they&apos;re clear, what they show and which shots could help. It&apos;s advice only and won&apos;t change your claim.
          </p>
          <div className="mt-3">
            <Button variant="ai" icon={ScanEye} onClick={check}>
              Check my photos with Ease
            </Button>
          </div>
          {skipped > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              I can look at {files.length} photos at a time, so I&apos;ll start with the first {files.length}.
            </p>
          )}
          {unreadable.length > 0 && (
            <p className="mt-2 text-xs text-amber-800">I can&apos;t read {unreadable.join(', ')}. JPEG, PNG and WebP photos work; iPhone HEIC photos don&apos;t.</p>
          )}
        </>
      ) : (
        <div className="space-y-5">
          {stale && !busy && (
            <Alert tone="info">
              You&apos;ve added or removed photos since this check.{' '}
              <button type="button" onClick={() => void check()} className="font-semibold underline underline-offset-2">
                Check again
              </button>
            </Alert>
          )}

          <div>
            <Pill tone={SEVERITY_TONE[result.severity]}>{SEVERITY_LABEL[result.severity]}</Pill>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-800">
              <Typewriter text={result.summary} instant={!checked?.fresh} />
            </p>
          </div>

          <ul className="space-y-2.5" aria-label="Photo by photo">
            {result.findings.map((f, i) => {
              const src = previews.get(f.fileName);
              return (
                <li key={`${f.fileName}-${i}`} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  {src ? (
                    <img src={src} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400" aria-hidden>
                      <ImageOff className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="min-w-0 break-all text-sm font-semibold text-slate-900">{f.fileName}</p>
                      <Pill tone={QUALITY_TONE[f.quality]}>{QUALITY_LABEL[f.quality]}</Pill>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{f.whatWeSee}</p>
                    {f.issues.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {f.issues.map((issue) => (
                          <li key={issue} className="flex items-start gap-1.5 text-xs text-amber-800">
                            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0">{issue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {result.missingShots.length > 0 && (
            <section aria-labelledby="photo-help-title">
              <h3 id="photo-help-title" className="eyebrow mb-2 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" aria-hidden /> Photos that would help
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {result.missingShots.map((shot) => (
                  <li key={shot} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700">
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ai-500" aria-hidden />
                    <span className="min-w-0">{shot}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-slate-500">This is advice only. It doesn&apos;t change your claim or your readiness score.</p>
        </div>
      )}
    </AiCard>
  );
}
