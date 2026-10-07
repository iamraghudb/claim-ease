import { useState, type DragEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, CloudUpload } from 'lucide-react';
import type { AiStatus } from '../../../domain/aiTypes';
import type { Role } from '../../../domain/types';
import { PERSONAS } from '../../../services';
import { useAppStore } from '../../../store/appStore';
import { useAiStatus } from '../../../store/useAiStatus';
import { AiBadge } from '../../../components/AiBadge';
import { EaseAvatar } from '../../../components/ai';
import { Alert, Spinner } from '../../../components/ui';
import { ChatThread } from './ChatThread';
import { ClaimSoFar, ClaimSoFarBar } from './ClaimSoFar';
import { Composer } from './Composer';
import { isProvider } from './copy';
import { useSmartStart } from './useSmartStart';

/** "Tell Ease what happened": a conversation that builds the claim as it goes. */
export default function SmartStart() {
  const role = useAppStore((s) => s.role);
  const status = useAiStatus();

  if (role === 'ADJUSTER' || role === 'ADMIN')
    return (
      <Alert tone="info" title="Switch persona to file a claim">
        Open the profile menu in the top right and choose the claimant or the healthcare provider.
      </Alert>
    );
  if (status === undefined) return <Spinner />;
  // No AI server in this deployment: the form is the way to file.
  if (status === null) return <Navigate to="/file/form" replace />;
  return <Conversation key={role} role={role} status={status} />;
}

function Conversation({ role, status }: { role: Role; status: AiStatus }) {
  const navigate = useNavigate();
  const allPolicies = useAppStore((s) => s.policies);
  const persona = PERSONAS[role];
  const smart = useSmartStart({ role, name: persona.name, allPolicies, customerId: persona.customerId });
  const [dragging, setDragging] = useState(false);

  const review = () => {
    smart.handOff(true);
    navigate('/file/form');
  };
  const carryOn = () => {
    smart.handOff(false);
    navigate('/file/form');
  };

  const files = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const onDragOver = (e: DragEvent) => {
    if (!files(e)) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!files(e)) return;
    e.preventDefault();
    setDragging(false);
    void smart.attach(Array.from(e.dataTransfer.files));
  };

  const side = { draft: smart.draft, stillNeeded: smart.stillNeeded, ready: smart.ready, verifying: smart.verifying, onReview: review, onContinue: carryOn };
  const nothingYet = smart.turns.length === 1;

  return (
    <div>
      <div className="mb-3">
        <Link to="/file" className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Choose another way
        </Link>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <ClaimSoFarBar {...side} />

          <section
            className="card relative flex h-[calc(100dvh-16rem)] min-h-[26rem] max-h-[52rem] flex-col overflow-hidden sm:h-[calc(100dvh-12rem)]"
            aria-label="Conversation with Ease"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <EaseAvatar size="md" pulse={nothingYet} />
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-slate-900">{isProvider(role) ? 'Tell Ease about the visit' : 'Tell Ease what happened'}</h1>
                <p className="truncate text-xs text-slate-500">Ease builds the claim as we talk</p>
              </div>
              <AiBadge source={smart.source ?? (status.configured ? 'ai' : 'demo')} />
            </header>

            <ChatThread
              turns={smart.turns}
              busy={smart.busy}
              verifying={smart.verifying}
              canRetry={smart.canRetry}
              ready={smart.ready}
              onRetry={smart.retry}
              onQuickReply={smart.send}
              onReview={review}
              onContinue={carryOn}
            />

            <Composer
              busy={smart.busy !== null}
              onSend={smart.send}
              onAttach={(f) => void smart.attach(f)}
              footer={
                smart.ready || nothingYet ? null : (
                  <button type="button" onClick={carryOn} className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 hover:decoration-slate-600">
                    Continue in the form
                  </button>
                )
              }
            />

            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-ai-50/90 ring-2 ring-inset ring-ai-400" aria-hidden>
                <p className="flex items-center gap-2 text-base font-bold text-ai-800">
                  <CloudUpload className="h-5 w-5" /> Drop it here and I&apos;ll read it
                </p>
              </div>
            )}
          </section>
        </div>

        {/* The padding and negative margin keep the card's shadow from being clipped when the column scrolls. */}
        <aside className="hidden lg:sticky lg:top-24 lg:-m-1.5 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:p-1.5" aria-label="Your claim so far">
          <ClaimSoFar {...side} />
        </aside>
      </div>
    </div>
  );
}
