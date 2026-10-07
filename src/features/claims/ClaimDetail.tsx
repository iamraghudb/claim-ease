import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileHeart, Paperclip, Printer, RotateCcw, Upload } from 'lucide-react';
import { canTransition, STATUS_DESCRIPTIONS } from '../../domain/statusMachine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaim } from '../../store/hooks';
import { useClaimAction } from '../../store/useClaimAction';
import { AuditTrail } from '../../components/AuditTrail';
import { ClaimTypeIcon, SlaBadge, SlaInfo, StatusBadge } from '../../components/badges';
import { CommunicationLog } from '../../components/CommunicationLog';
import { DocumentGallery, FileUploader, toDocInputs, type PendingDoc } from '../../components/Documents';
import { formatDate } from '../../components/format';
import { Timeline } from '../../components/Timeline';
import { Button, ButtonLink, Card, EmptyState, Modal } from '../../components/ui';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { AppealModal } from './AppealModal';
import { useCopilotPage } from '../copilot/pages';
import { ClaimDetailsCard } from './ClaimDetailsCard';
import { DecisionCard, PaymentCard } from './DecisionCard';
import { claimPageData } from './easeContext';
import { EaseSummary } from './EaseSummary';
import { InfoRequestPanel } from './InfoRequestPanel';

export default function ClaimDetail() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const { role, actor } = useAppStore();
  const [appealOpen, setAppealOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const { run, pending } = useClaimAction();
  const staff = role === 'ADJUSTER' || role === 'ADMIN';

  // Tell Ease what this screen shows. Staff screens register themselves, so only claimant and provider views do it here.
  const copilotPage = useMemo(
    () =>
      claim && !staff
        ? {
            path: `/claims/${claim.claimNumber}`,
            title: `Claim ${claim.claimNumber}`,
            summary: "One claim's tracker: its progress, status, decision, documents and activity.",
            data: claimPageData(claim),
            suggestions: ['Where does my claim stand?', 'What do I need to do next?', 'How long will this take?'],
          }
        : null,
    [claim, staff],
  );
  useCopilotPage(copilotPage);

  if (!claim)
    return <EmptyState icon={Paperclip} title="Claim not found" message={`We couldn't find ${claimNumber}.`} action={<ButtonLink to="/claims">Back to my claims</ButtonLink>} />;

  const canAppeal = canTransition(claim.status, 'APPEALED', role);
  const publicAudit = claim.auditTrail.filter((a) => a.action !== 'Note added' && a.action !== 'Rules engine evaluated');

  async function upload() {
    const ok = await run('upload', () => claimService.addDocuments(claim!.claimNumber, toDocInputs(docs), actor), 'Documents uploaded');
    if (ok) {
      setDocs([]);
      setUploadOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link to={staff ? '/queue' : '/claims'} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {staff ? 'Work queue' : 'My claims'}
      </Link>

      <InfoRequestPanel claim={claim} />

      <section className="card overflow-hidden" aria-labelledby="claim-title">
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <ClaimTypeIcon type={claim.claimType} size="lg" />
              <div className="min-w-0">
                <p className="eyebrow">
                  {CLAIM_TYPE_LABELS[claim.claimType]} claim · Policy {claim.policyNumber}
                </p>
                <h1 id="claim-title" className="font-mono text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  {claim.claimNumber}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  {claim.claimantName} · Filed {formatDate(claim.createdAt)}
                </p>
              </div>
            </div>
            <div className="no-print flex flex-wrap items-center gap-2">
              {staff && (
                <ButtonLink to={`/queue/${claim.claimNumber}`} variant="secondary">
                  Open in workspace
                </ButtonLink>
              )}
              {claim.claimType === 'HEALTH' && (
                <ButtonLink to={`/health/${claim.claimNumber}`} variant="secondary" icon={FileHeart}>
                  837 / 835 view
                </ButtonLink>
              )}
              <ButtonLink to={`/claims/${claim.claimNumber}/file`} variant="secondary" icon={Printer}>
                Claim file
              </ButtonLink>
              {canAppeal && (
                <Button icon={RotateCcw} onClick={() => setAppealOpen(true)}>
                  File an appeal
                </Button>
              )}
            </div>
          </div>

          <div className="mt-8" data-tour="claim-timeline">
            <Timeline claim={claim} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-8">
          <StatusBadge status={claim.status} />
          <p className="min-w-0 flex-1 text-sm text-slate-700">{STATUS_DESCRIPTIONS[claim.status]}</p>
          <span className="flex items-center gap-1.5">
            <SlaBadge claim={claim} />
            <SlaInfo />
          </span>
        </div>
      </section>

      {!staff && <EaseSummary key={claim.claimNumber} claim={claim} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <DecisionCard claim={claim} canExplain={!staff} />
          <PaymentCard claim={claim} />
          <ClaimDetailsCard claim={claim} />
          <Card
            title={`Documents (${claim.documents.length})`}
            icon={Paperclip}
            actions={
              claim.status !== 'CLOSED' &&
              claim.status !== 'INFORMATION_REQUIRED' && (
                <Button size="sm" variant="secondary" icon={Upload} onClick={() => setUploadOpen(true)}>
                  Add documents
                </Button>
              )
            }
          >
            <DocumentGallery documents={claim.documents} />
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <CommunicationLog claim={claim} />
          <AuditTrail entries={staff ? claim.auditTrail : publicAudit} />
        </div>
      </div>

      <AppealModal claim={claim} open={appealOpen} onClose={() => setAppealOpen(false)} />
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={`Add documents · ${CLAIM_TYPE_LABELS[claim.claimType]} claim`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={!docs.length} loading={pending === 'upload'}>
              Upload {docs.length || ''} file{docs.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <FileUploader value={docs} onChange={setDocs} />
      </Modal>
    </div>
  );
}
