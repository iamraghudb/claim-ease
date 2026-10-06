import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CircleAlert,
  FileHeart,
  Flag,
  FolderOpen,
  Gavel,
  Play,
  Printer,
  RotateCcw,
  Search,
  UserCheck,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { canTransition, STATUS_LABELS } from '../../domain/statusMachine';
import type { ClaimStatus } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaim, useRules } from '../../store/hooks';
import { useClaimAction } from '../../store/useClaimAction';
import { AuditTrail } from '../../components/AuditTrail';
import { ClaimTypeTag, ComplexityBadge, FastTrackBadge, PriorityBadge, SlaBadge, StatusBadge } from '../../components/badges';
import { CommunicationLog } from '../../components/CommunicationLog';
import { DocumentGallery } from '../../components/Documents';
import { formatDate } from '../../components/format';
import { Alert, Button, ButtonLink, Card, EmptyState, PageHeader, Pill, Tabs } from '../../components/ui';
import { SLA_DISCLAIMER } from '../../domain/sla';
import { ClaimDetailsCard } from '../claims/ClaimDetailsCard';
import { DecisionCard } from '../claims/DecisionCard';
import { AdjudicationPanel } from './AdjudicationPanel';
import { ExpertInputs } from './ExpertInputs';
import { NotesPanel } from './NotesPanel';
import { PaymentPanel } from './PaymentPanel';
import { PolicySummary } from './PolicySummary';
import { RequestInfoModal } from './RequestInfoModal';
import { RulesPanel } from './RulesPanel';
import { Timeline } from '../../components/Timeline';

type Tab = 'review' | 'documents' | 'communication' | 'audit';

export default function ClaimReview() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const rules = useRules(claim);
  const { role, actor, policies, customers } = useAppStore();
  const { run, pending } = useClaimAction();
  const [tab, setTab] = useState<Tab>('review');
  const [requestOpen, setRequestOpen] = useState(false);

  if (role !== 'ADJUSTER' && role !== 'ADMIN')
    return (
      <Alert tone="info" icon={Lock} title="Adjuster workspace">
        Switch to the Adjuster / Examiner or Admin role in the header to review claims. <Link className="underline" to={`/claims/${claimNumber}`}>View as claimant instead</Link>.
      </Alert>
    );
  if (!claim || !rules) return <EmptyState icon={FolderOpen} title="Claim not found" action={<ButtonLink to="/queue">Back to queue</ButtonLink>} />;

  const policy = policies.find((p) => p.policyNumber === claim.policyNumber);
  const customer = customers.find((c) => c.id === policy?.customerId);
  const can = (to: ClaimStatus) => canTransition(claim.status, to, role);
  const move = (to: ClaimStatus, msg: string, details?: string) => run(to, () => claimService.transition(claim.claimNumber, to, actor, details), msg);

  const actions: { key: string; label: string; icon: LucideIcon; enabled: boolean; onClick: () => void; variant?: 'primary' | 'secondary'; why: string }[] = [
    {
      key: 'assign',
      label: claim.assignedAdjuster === actor.name ? 'Assigned to you' : 'Assign to me',
      icon: UserCheck,
      enabled: claim.assignedAdjuster !== actor.name && claim.status !== 'CLOSED',
      onClick: () => run('assign', () => claimService.assign(claim.claimNumber, actor.name, actor), 'Assigned to you'),
      why: claim.status === 'CLOSED' ? 'Claim is closed' : 'Already assigned to you',
    },
    { key: 'REGISTERED', label: 'Register', icon: Play, enabled: can('REGISTERED'), onClick: () => move('REGISTERED', 'Claim registered'), why: 'Only from Reported' },
    {
      key: 'UNDER_REVIEW',
      label: claim.status === 'INFORMATION_REQUIRED' ? 'Resume review' : claim.status === 'APPEALED' ? 'Return to review' : 'Start review',
      icon: Play,
      enabled: can('UNDER_REVIEW'),
      onClick: () => move('UNDER_REVIEW', 'Review started'),
      why: 'Not available in this status',
    },
    { key: 'INFORMATION_REQUIRED', label: 'Request info', icon: CircleAlert, enabled: can('INFORMATION_REQUIRED'), onClick: () => setRequestOpen(true), why: 'Only during review, investigation or adjudication' },
    { key: 'INVESTIGATION', label: 'Investigate', icon: Search, enabled: can('INVESTIGATION'), onClick: () => move('INVESTIGATION', 'Moved to investigation'), why: 'Only from Under review' },
    {
      key: 'ADJUDICATION',
      label: claim.status === 'APPEALED' ? 'Re-adjudicate' : rules.fastTrackEligible && claim.status === 'UNDER_REVIEW' ? 'Fast-track to adjudication' : 'Send to adjudication',
      icon: Gavel,
      enabled: can('ADJUDICATION'),
      onClick: () => move('ADJUDICATION', 'Sent to adjudication', claim.status === 'UNDER_REVIEW' && rules.fastTrackEligible ? 'Fast-track: no review triggers' : undefined),
      variant: 'primary',
      why: 'Only from Under review, Investigation or Appealed',
    },
    { key: 'CLOSED', label: 'Close', icon: Lock, enabled: can('CLOSED'), onClick: () => move('CLOSED', 'Claim closed'), why: 'Only after payment or denial' },
    { key: 'REOPENED', label: 'Reopen', icon: RotateCcw, enabled: can('REOPENED'), onClick: () => move('REOPENED', 'Claim reopened'), why: 'Only closed claims can be reopened' },
  ];

  const toggleTag = (tag: string) => {
    const tags = claim.tags.includes(tag) ? claim.tags.filter((t) => t !== tag) : [...claim.tags, tag];
    void run('tags', () => claimService.setTags(claim.claimNumber, tags, actor), 'Flags updated');
  };

  const lastRequest = claim.informationRequests.at(-1);

  return (
    <div>
      <PageHeader
        back={
          <Link to="/queue" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Work queue
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{claim.claimNumber}</span>
            <StatusBadge status={claim.status} />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ClaimTypeTag type={claim.claimType} />
            <span>· {claim.claimantName}</span>
            <span>· Adjuster: {claim.assignedAdjuster ?? <em>unassigned</em>}</span>
            <PriorityBadge priority={rules.priority} />
            <ComplexityBadge complexity={rules.complexity} />
            {rules.fastTrackEligible && <FastTrackBadge />}
            <SlaBadge claim={claim} />
          </span>
        }
        actions={
          <>
            {claim.claimType === 'HEALTH' && (
              <ButtonLink to={`/health/${claim.claimNumber}`} variant="secondary" icon={FileHeart}>
                837 / 835
              </ButtonLink>
            )}
            <ButtonLink to={`/claims/${claim.claimNumber}/file`} variant="secondary" icon={Printer}>
              Claim file
            </ButtonLink>
          </>
        }
      />

      <div className="no-print mb-6 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3" role="toolbar" aria-label="Claim actions">
        {actions.map((a) => (
          <Button
            key={a.key}
            size="sm"
            variant={a.enabled && a.variant === 'primary' ? 'primary' : 'secondary'}
            icon={a.icon}
            disabled={!a.enabled}
            loading={pending === a.key}
            onClick={a.onClick}
            title={a.enabled ? undefined : a.why}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <Tabs<Tab>
            label="Claim review sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'review', label: 'Review & decide' },
              { value: 'documents', label: `Documents (${claim.documents.length})` },
              { value: 'communication', label: `Communication (${claim.communicationLog.length})` },
              { value: 'audit', label: 'Audit trail' },
            ]}
          />
          {tab === 'review' && (
            <div className="space-y-6">
              {claim.status === 'APPEALED' && claim.appeals.at(-1) && (
                <Alert tone="warn" icon={RotateCcw} title={`Appeal filed ${formatDate(claim.appeals.at(-1)!.filedAt)}`}>
                  {claim.appeals.at(-1)!.reason}
                </Alert>
              )}
              <RulesPanel rules={rules} isHealth={claim.claimType === 'HEALTH'} />
              {['UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION', 'APPEALED'].includes(claim.status) && (
                <AdjudicationPanel key={`${claim.status}-${claim.decisionHistory.length}`} claim={claim} rules={rules} onRequestInfo={() => setRequestOpen(true)} />
              )}
              <PaymentPanel key={claim.decision?.decidedAt ?? 'none'} claim={claim} />
              <DecisionCard claim={claim} showInternal />
              <ClaimDetailsCard claim={claim} />
              <Card title="Lifecycle">
                <Timeline claim={claim} />
                <p className="mt-3 text-xs text-slate-500">{SLA_DISCLAIMER}</p>
              </Card>
            </div>
          )}
          {tab === 'documents' && (
            <Card title="Documents gallery">
              <DocumentGallery documents={claim.documents} highlight={claim.appeals.flatMap((a) => a.documentIds)} />
            </Card>
          )}
          {tab === 'communication' && <CommunicationLog claim={claim} />}
          {tab === 'audit' && <AuditTrail entries={claim.auditTrail} />}
        </div>

        <aside className="min-w-0 space-y-6">
          <PolicySummary policy={policy} customer={customer} />
          <Card title="Flags" icon={Flag}>
            <div className="flex flex-wrap gap-2">
              {[
                { tag: 'CATASTROPHE', label: 'Catastrophe event' },
                { tag: 'LEGAL', label: 'Attorney involved' },
              ].map((f) => (
                <label key={f.tag} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={claim.tags.includes(f.tag)} onChange={() => toggleTag(f.tag)} disabled={claim.status === 'CLOSED'} />
                  {f.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Flags feed the rules engine and SLA priority.</p>
          </Card>
          {lastRequest && (
            <Card title="Information requests" icon={CircleAlert}>
              <ul className="space-y-3">
                {[...claim.informationRequests].reverse().map((r) => (
                  <li key={r.id} className="text-sm">
                    <p className="text-xs text-slate-500">
                      {formatDate(r.requestedAt)} by {r.requestedBy} · {r.respondedAt ? `answered ${formatDate(r.respondedAt)}` : 'awaiting response'}
                    </p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {r.items.map((i) => (
                        <Pill key={i.id} tone={i.fulfilled ? 'green' : 'amber'}>
                          {i.label}
                        </Pill>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <ExpertInputs claim={claim} disabled={claim.status === 'CLOSED'} />
          <NotesPanel claim={claim} />
        </aside>
      </div>
      <RequestInfoModal claim={claim} open={requestOpen} onClose={() => setRequestOpen(false)} />
      <span className="sr-only" aria-live="polite">
        Status {STATUS_LABELS[claim.status]}
      </span>
    </div>
  );
}
