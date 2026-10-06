import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileHeart, Paperclip, Printer, RotateCcw, Upload } from 'lucide-react';
import { canTransition } from '../../domain/statusMachine';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaim } from '../../store/hooks';
import { useClaimAction } from '../../store/useClaimAction';
import { AuditTrail } from '../../components/AuditTrail';
import { ClaimTypeTag, SlaBadge, StatusBadge } from '../../components/badges';
import { CommunicationLog } from '../../components/CommunicationLog';
import { DocumentGallery, FileUploader, toDocInputs, type PendingDoc } from '../../components/Documents';
import { Timeline } from '../../components/Timeline';
import { Button, ButtonLink, Card, EmptyState, Modal, PageHeader } from '../../components/ui';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { AppealModal } from './AppealModal';
import { ClaimDetailsCard } from './ClaimDetailsCard';
import { DecisionCard, PaymentCard } from './DecisionCard';
import { InfoRequestPanel } from './InfoRequestPanel';
import { SLA_DISCLAIMER } from '../../domain/sla';

export default function ClaimDetail() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const { role, actor } = useAppStore();
  const [appealOpen, setAppealOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const { run, pending } = useClaimAction();

  if (!claim)
    return <EmptyState icon={Paperclip} title="Claim not found" message={`We couldn't find ${claimNumber}.`} action={<ButtonLink to="/claims">Back to my claims</ButtonLink>} />;

  const canAppeal = canTransition(claim.status, 'APPEALED', role);
  const staff = role === 'ADJUSTER' || role === 'ADMIN';
  const publicAudit = claim.auditTrail.filter((a) => a.action !== 'Note added' && a.action !== 'Rules engine evaluated');

  async function upload() {
    const ok = await run('upload', () => claimService.addDocuments(claim!.claimNumber, toDocInputs(docs), actor), 'Documents uploaded');
    if (ok) {
      setDocs([]);
      setUploadOpen(false);
    }
  }

  return (
    <div>
      <PageHeader
        back={
          <Link to={staff ? '/queue' : '/claims'} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> {staff ? 'Work queue' : 'My claims'}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{claim.claimNumber}</span>
            <StatusBadge status={claim.status} />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <ClaimTypeTag type={claim.claimType} />
            <span>Policy {claim.policyNumber}</span>
            <span>{claim.claimantName}</span>
            <SlaBadge claim={claim} />
          </span>
        }
        actions={
          <>
            {staff && <ButtonLink to={`/queue/${claim.claimNumber}`} variant="secondary">Open in workspace</ButtonLink>}
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
          </>
        }
      />

      <div className="space-y-6">
        <InfoRequestPanel claim={claim} />

        <Card title="Claim progress">
          <Timeline claim={claim} />
          <p className="mt-3 text-xs text-slate-500">{SLA_DISCLAIMER}</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-6">
            <DecisionCard claim={claim} />
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
              Upload {docs.length || ''} file(s)
            </Button>
          </>
        }
      >
        <FileUploader value={docs} onChange={setDocs} />
      </Modal>
    </div>
  );
}
