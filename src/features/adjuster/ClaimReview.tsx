import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Check,
  CircleAlert,
  ClipboardCheck,
  Clock,
  FileHeart,
  Flag,
  FolderOpen,
  Gavel,
  Lock,
  Paperclip,
  Play,
  Printer,
  RotateCcw,
  Route,
  Search,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { buildStaffContext } from '../../domain/aiContext';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { canTransition, STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim, ClaimStatus, DecisionOutcome, RulesResult } from '../../domain/types';
import { claimService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { useClaim, useRules } from '../../store/hooks';
import { useClaimAction } from '../../store/useClaimAction';
import { AuditTrail } from '../../components/AuditTrail';
import { ClaimTypeIcon, ComplexityBadge, FastTrackBadge, PriorityBadge, SlaBadge, SlaInfo, StatusBadge } from '../../components/badges';
import { CommunicationLog } from '../../components/CommunicationLog';
import { DocumentGallery } from '../../components/Documents';
import { formatDate, formatDateTime } from '../../components/format';
import { Alert, Avatar, Button, ButtonLink, Card, cx, EmptyState, InfoTip, Pill, Tabs } from '../../components/ui';
import { ClaimDetailsCard } from '../claims/ClaimDetailsCard';
import { DecisionCard } from '../claims/DecisionCard';
import { useCopilotPage } from '../copilot/pages';
import { AdjudicationPanel, type SuggestedChoice } from './AdjudicationPanel';
import { AiBrief } from './AiBrief';
import { reviewPage } from './copilotData';
import { ExpertInputs } from './ExpertInputs';
import { NotesPanel } from './NotesPanel';
import { PaymentPanel } from './PaymentPanel';
import { PolicySummary } from './PolicySummary';
import { RequestInfoModal } from './RequestInfoModal';
import { PayableCard, RulesPanel, UncertaintyMeter } from './RulesPanel';
import { Timeline } from '../../components/Timeline';

type Tab = 'review' | 'documents' | 'notes' | 'communication' | 'audit';

interface Cta {
  key: string;
  label: string;
  icon: LucideIcon;
  enabled: boolean;
  onClick: () => void;
  why: string;
}

/** What the adjuster should do next, in plain words, by status. */
const NEXT_STEP: Record<ClaimStatus, { title: string; hint: string }> = {
  REPORTED: { title: 'Register this claim', hint: 'Issue the claim number and queue it for review.' },
  REGISTERED: { title: 'Start the review', hint: 'Check the rules-engine results, documents and policy.' },
  UNDER_REVIEW: { title: 'Review, then move it on', hint: 'Work through the checks. Move it to a decision, investigate, or ask for more information.' },
  INFORMATION_REQUIRED: { title: 'Waiting on the claimant', hint: 'The SLA clock is paused. Resume the review once the items arrive.' },
  INVESTIGATION: { title: 'Finish the investigation', hint: 'Record any expert input, then move the claim to a decision.' },
  ADJUDICATION: { title: 'Record a decision', hint: 'Approve, partially approve or deny. Or ask the claimant for more information.' },
  APPROVED: { title: 'Queue the payment', hint: 'The claim is approved. Start the payout when you are ready.' },
  PARTIALLY_APPROVED: { title: 'Queue the payment', hint: 'You can pay the undisputed amount now. The claimant may still appeal.' },
  DENIED: { title: 'Decision recorded', hint: 'The claimant can appeal. Close the claim when you are done.' },
  APPEALED: { title: 'Review the appeal', hint: 'Decide it again, or return it to review for a fresh look.' },
  PAYMENT_PENDING: { title: 'Issue the payment', hint: 'Enter the payment details, then mark the payment as issued.' },
  PAID: { title: 'Close the claim', hint: 'Payment has been issued. Nothing else is outstanding.' },
  CLOSED: { title: 'This claim is closed', hint: 'Reopen it if new information comes in.' },
  REOPENED: { title: 'Claim reopened', hint: 'Start a review to pick it back up.' },
};

const TAG_LABELS: Record<string, string> = { CATASTROPHE: 'Storm or disaster', LEGAL: 'Attorney involved' };
const FLAGS = [
  { tag: 'CATASTROPHE', label: 'Storm or disaster', hint: 'Marks the claim urgent and adds review weight.' },
  { tag: 'LEGAL', label: 'Attorney involved', hint: 'Communication must go through counsel.' },
];
const DECISION_STATUSES: ClaimStatus[] = ['UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION', 'APPEALED'];
const PAYMENT_STATUSES: ClaimStatus[] = ['APPROVED', 'PARTIALLY_APPROVED', 'PAYMENT_PENDING', 'PAID'];

export default function ClaimReview() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const rules = useRules(claim);
  const { role, actor, policies, customers } = useAppStore();
  const { run, pending } = useClaimAction();
  const [tab, setTab] = useState<Tab>('review');
  const [requestOpen, setRequestOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<(SuggestedChoice & { forKey: string }) | undefined>();

  // What Ease may know about this claim: the rules engine's findings with no names or contact details.
  // Built once per change so the remembered brief is found again.
  const isStaff = role === 'ADJUSTER' || role === 'ADMIN';
  const staffContext = useMemo(
    () => (claim && rules && isStaff ? buildStaffContext(claim, rules, policies.find((p) => p.policyNumber === claim.policyNumber)) : null),
    [claim, rules, policies, isStaff],
  );
  useCopilotPage(claim && staffContext ? reviewPage(claim.claimNumber, staffContext) : null);

  if (role !== 'ADJUSTER' && role !== 'ADMIN')
    return (
      <Alert tone="info" icon={Lock} title="Adjuster workspace">
        Switch to the Adjuster or Admin role in the header to review claims. <Link className="underline" to={`/claims/${claimNumber}`}>View as claimant instead</Link>.
      </Alert>
    );
  if (!claim || !rules) return <EmptyState icon={FolderOpen} title="Claim not found" message="We could not find that claim. It may have been removed." action={<ButtonLink to="/queue">Back to work queue</ButtonLink>} />;

  const policy = policies.find((p) => p.policyNumber === claim.policyNumber);
  const customer = customers.find((c) => c.id === policy?.customerId);
  const can = (to: ClaimStatus) => canTransition(claim.status, to, role);
  const move = (to: ClaimStatus, msg: string, details?: string) => run(to, () => claimService.transition(claim.claimNumber, to, actor, details), msg);

  const actions: Cta[] = [
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
      label: claim.status === 'APPEALED' ? 'Review again' : rules.fastTrackEligible && claim.status === 'UNDER_REVIEW' ? 'Fast-track to decision' : 'Move to decision',
      icon: Gavel,
      enabled: can('ADJUDICATION'),
      onClick: () => move('ADJUDICATION', 'Moved to decision', claim.status === 'UNDER_REVIEW' && rules.fastTrackEligible ? 'Fast-track: no review triggers' : undefined),
      why: 'Only from Under review, Investigation or Appealed',
    },
    { key: 'CLOSED', label: 'Close claim', icon: Lock, enabled: can('CLOSED'), onClick: () => move('CLOSED', 'Claim closed', claim.status === 'PAID' ? 'Payment complete' : undefined), why: 'Only after payment or denial' },
    { key: 'REOPENED', label: 'Reopen', icon: RotateCcw, enabled: can('REOPENED'), onClick: () => move('REOPENED', 'Claim reopened'), why: 'Only closed claims can be reopened' },
  ];
  const byKey = (k: string) => actions.find((a) => a.key === k);
  const goToActions = () => {
    const el = document.getElementById('claim-actions');
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    (el.querySelector<HTMLElement>('input[type=radio]:checked') ?? el.querySelector<HTMLElement>('input, select, textarea'))?.focus({ preventScroll: true });
  };

  // The one thing the adjuster most likely wants to do now. Everything else stays reachable in "More actions".
  let primary: Cta | undefined;
  switch (claim.status) {
    case 'REPORTED':
      primary = byKey('REGISTERED');
      break;
    case 'REGISTERED':
    case 'REOPENED':
    case 'INFORMATION_REQUIRED':
      primary = byKey('UNDER_REVIEW');
      break;
    case 'UNDER_REVIEW':
    case 'INVESTIGATION':
    case 'APPEALED':
      primary = byKey('ADJUDICATION');
      break;
    case 'ADJUDICATION':
      primary = { key: 'decide', label: 'Go to decision', icon: Gavel, enabled: true, onClick: goToActions, why: '' };
      break;
    case 'APPROVED':
    case 'PARTIALLY_APPROVED':
      primary = {
        key: 'queue',
        label: 'Queue payment',
        icon: Banknote,
        enabled: can('PAYMENT_PENDING'),
        onClick: () => run('queue', () => claimService.transition(claim.claimNumber, 'PAYMENT_PENDING', actor), 'Payment queued'),
        why: 'Not available in this status',
      };
      break;
    case 'PAYMENT_PENDING':
      primary = { key: 'pay', label: 'Enter payment details', icon: Banknote, enabled: true, onClick: goToActions, why: '' };
      break;
    case 'PAID':
    case 'DENIED':
      primary = byKey('CLOSED');
      break;
    case 'CLOSED':
      primary = byKey('REOPENED');
      break;
  }
  const others = actions.filter((a) => a.enabled && a.key !== 'assign' && a.key !== primary?.key);

  // Ease's brief can take the adjuster to the decision form with its suggestion marked. Amounts are never touched.
  const decisionKey = `${claim.claimNumber}-${claim.status}-${claim.decisionHistory.length}`;
  const showSuggestion = (choice: DecisionOutcome) => {
    setSuggestion({ choice, nonce: Date.now(), forKey: decisionKey });
    setTimeout(goToActions, 80);
  };

  const toggleTag = (tag: string) => {
    const tags = claim.tags.includes(tag) ? claim.tags.filter((t) => t !== tag) : [...claim.tags, tag];
    void run('tags', () => claimService.setTags(claim.claimNumber, tags, actor), 'Flags updated');
  };

  const showDecision = DECISION_STATUSES.includes(claim.status);
  const showPayment = PAYMENT_STATUSES.includes(claim.status);
  const appeal = claim.status === 'APPEALED' ? claim.appeals.at(-1) : undefined;
  const awaitingReply = claim.informationRequests.some((r) => !r.respondedAt);

  return (
    <div>
      <div className="no-print mb-4">
        <Link to="/queue" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Work queue
        </Link>
      </div>

      <SummaryCard claim={claim} rules={rules} primary={primary} assign={byKey('assign')!} pending={pending} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {staffContext && <AiBrief context={staffContext} claimStatus={claim.status} role={role} onRequestInfo={() => setRequestOpen(true)} onDecide={showSuggestion} />}

          <Tabs<Tab>
            label="Claim review sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'review', label: 'Review' },
              { value: 'documents', label: `Documents (${claim.documents.length})` },
              { value: 'notes', label: `Notes & experts (${claim.notes.length + claim.expertInputs.length})` },
              { value: 'communication', label: `Communication (${claim.communicationLog.length})` },
              { value: 'audit', label: 'Audit trail' },
            ]}
          />

          {tab === 'review' && (
            <div className="space-y-6" role="tabpanel" aria-label="Review">
              {appeal && (
                <Alert tone="warn" icon={RotateCcw} title={`Appeal filed ${formatDate(appeal.filedAt)}`}>
                  {appeal.reason}
                </Alert>
              )}
              <DecisionCard claim={claim} showInternal />
              <RulesPanel rules={rules} />
              <PayableCard rules={rules} isHealth={claim.claimType === 'HEALTH'} />
              <ClaimDetailsCard claim={claim} />
              <Card title="Lifecycle" icon={Route}>
                <Timeline claim={claim} />
              </Card>
            </div>
          )}
          {tab === 'documents' && (
            <div role="tabpanel" aria-label="Documents">
              <Card title="Documents" icon={Paperclip} actions={<Pill tone="slate">{claim.documents.length} {claim.documents.length === 1 ? 'file' : 'files'}</Pill>}>
                {claim.documents.length === 0 ? (
                  <EmptyState icon={Paperclip} title="No documents yet" message="Anything the claimant uploads will appear here." />
                ) : (
                  <DocumentGallery documents={claim.documents} highlight={claim.appeals.flatMap((a) => a.documentIds)} />
                )}
              </Card>
            </div>
          )}
          {tab === 'notes' && (
            <div className="grid items-start gap-6 xl:grid-cols-2" role="tabpanel" aria-label="Notes and experts">
              <NotesPanel claim={claim} />
              <ExpertInputs claim={claim} disabled={claim.status === 'CLOSED'} />
            </div>
          )}
          {tab === 'communication' && (
            <div role="tabpanel" aria-label="Communication">
              <CommunicationLog claim={claim} />
            </div>
          )}
          {tab === 'audit' && (
            <div role="tabpanel" aria-label="Audit trail">
              <AuditTrail entries={claim.auditTrail} />
            </div>
          )}
        </div>

        <aside className="min-w-0 space-y-6" aria-label="Claim actions and context">
          {(showDecision || showPayment || others.length > 0) && (
            <div id="claim-actions" data-tour="actions-rail" className="no-print scroll-mt-24">
              <Card title="Actions" icon={ClipboardCheck}>
                <div className="divide-y divide-slate-100 [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
                  {showDecision && <AdjudicationPanel key={decisionKey} claim={claim} rules={rules} onRequestInfo={() => setRequestOpen(true)} suggested={suggestion?.forKey === decisionKey ? suggestion : undefined} embedded />}
                  {showPayment && <PaymentPanel key={claim.decision?.decidedAt ?? 'none'} claim={claim} embedded />}
                  {others.length > 0 && (
                    <section aria-labelledby="more-actions-heading">
                      <h3 id="more-actions-heading" className="eyebrow mb-2.5">
                        More actions
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {others.map((a) => (
                          <Button key={a.key} size="sm" variant="secondary" icon={a.icon} className="w-full" loading={pending === a.key} onClick={a.onClick}>
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </Card>
            </div>
          )}

          <PolicySummary policy={policy} customer={customer} />

          <Card title="Flags" icon={Flag}>
            <ul className="space-y-2">
              {FLAGS.map((f) => {
                const on = claim.tags.includes(f.tag);
                const locked = claim.status === 'CLOSED';
                return (
                  <li key={f.tag}>
                    <label
                      className={cx(
                        'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                        on ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200',
                        locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50',
                      )}
                    >
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={on} onChange={() => toggleTag(f.tag)} disabled={locked} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{f.label}</span>
                        <span className="block text-xs text-slate-500">{f.hint}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-slate-500">Flags feed the rules engine and the SLA priority.</p>
          </Card>

          {claim.informationRequests.length > 0 && (
            <Card title="Information requests" icon={CircleAlert} actions={awaitingReply && <Pill tone="amber">Awaiting reply</Pill>}>
              <ol className="space-y-4">
                {[...claim.informationRequests].reverse().map((r) => (
                  <li key={r.id} className="text-sm">
                    <p className="text-xs text-slate-500">
                      {formatDate(r.requestedAt)} by {r.requestedBy} · {r.respondedAt ? `answered ${formatDate(r.respondedAt)}` : 'awaiting response'}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {r.items.map((i) => (
                        <li key={i.id}>
                          <Pill tone={i.fulfilled ? 'green' : 'amber'}>
                            {i.fulfilled ? <Check className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}
                            {i.label}
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </aside>
      </div>

      <RequestInfoModal claim={claim} open={requestOpen} onClose={() => setRequestOpen(false)} />
      <span className="sr-only" aria-live="polite">
        Status {STATUS_LABELS[claim.status]}
      </span>
    </div>
  );
}

/** The claim at a glance: identity, money, SLA, owner, uncertainty, and the next step. */
function SummaryCard({ claim, rules, primary, assign, pending }: { claim: Claim; rules: RulesResult; primary?: Cta; assign: Cta; pending: string | null }) {
  const actor = useAppStore((s) => s.actor);
  const mine = claim.assignedAdjuster === actor.name;
  const step = NEXT_STEP[claim.status];
  return (
    <section className="card" aria-label="Claim summary">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <ClaimTypeIcon type={claim.claimType} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">{claim.claimNumber}</h1>
                <StatusBadge status={claim.status} />
              </div>
              <p className="mt-1.5 text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{claim.claimantName}</span> · {CLAIM_TYPE_LABELS[claim.claimType]} claim · Policy {claim.policyNumber}
              </p>
            </div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {claim.claimType === 'HEALTH' && (
              <ButtonLink to={`/health/${claim.claimNumber}`} variant="secondary" size="sm" icon={FileHeart}>
                837 / 835
              </ButtonLink>
            )}
            <ButtonLink to={`/claims/${claim.claimNumber}/file`} variant="secondary" size="sm" icon={Printer}>
              Claim file
            </ButtonLink>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
          <Stat label="Claimed amount" className="order-2 lg:order-1">
            <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{formatUSD(claim.estimatedAmount)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Calculated payable {formatUSD(rules.payable.payable)}</p>
          </Stat>
          <Stat label="SLA target" info={<SlaInfo />} className="order-1 lg:order-2">
            <SlaBadge claim={claim} />
            {claim.status !== 'CLOSED' && <p className="mt-1.5 text-xs text-slate-500">Due {formatDateTime(claim.slaDueDate)}</p>}
          </Stat>
          <Stat label="Adjuster" className="order-4 lg:order-3">
            {claim.assignedAdjuster ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Avatar name={claim.assignedAdjuster} size="sm" tone={mine ? 'teal' : 'slate'} />
                <span className="min-w-0 truncate">
                  {claim.assignedAdjuster}
                  {mine && <span className="ml-1 text-xs font-semibold text-brand-700">(you)</span>}
                </span>
              </p>
            ) : (
              <p className="text-sm font-semibold text-amber-700">Unassigned</p>
            )}
            {assign.enabled && (
              <Button size="sm" variant="secondary" icon={UserCheck} className="no-print mt-2" loading={pending === 'assign'} onClick={assign.onClick}>
                {assign.label}
              </Button>
            )}
          </Stat>
          <Stat label="Uncertainty" className="order-3 lg:order-4" info={<InfoTip label="About uncertainty">More uncertainty means more investigation and human review.</InfoTip>}>
            <UncertaintyMeter score={rules.uncertaintyScore} compact />
          </Stat>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={rules.priority} />
          <ComplexityBadge complexity={rules.complexity} />
          {rules.fastTrackEligible && <FastTrackBadge />}
          {claim.tags.map((t) => (
            <Pill key={t} tone="amber">
              {TAG_LABELS[t] ?? t}
            </Pill>
          ))}
        </div>
      </div>

      <div className="no-print flex flex-col gap-3 rounded-b-2xl border-t border-brand-100 bg-brand-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <p className="eyebrow text-brand-700">Next step</p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">{step.title}</p>
          <p className="text-sm text-slate-600">{step.hint}</p>
        </div>
        {primary && (
          <Button className="w-full shrink-0 sm:w-auto" icon={primary.icon} disabled={!primary.enabled} loading={pending === primary.key} onClick={primary.onClick} title={primary.enabled ? undefined : primary.why}>
            {primary.label}
          </Button>
        )}
      </div>
    </section>
  );
}

function Stat({ label, info, className, children }: { label: string; info?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cx('min-w-0', className)}>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="eyebrow">{label}</span>
        {info}
      </div>
      {children}
    </div>
  );
}
