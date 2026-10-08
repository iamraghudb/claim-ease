import { nextClaimNumber } from '../domain/claimNumber';
import { DENIAL_REASON_CODES } from '../domain/catalog';
import { evaluateClaim, formatUSD } from '../domain/rulesEngine';
import { computeSlaDueDate } from '../domain/sla';
import { assertTransition, canTransition, STATUS_LABELS } from '../domain/statusMachine';
import type {
  Actor,
  AppNotification,
  AuditEntry,
  Claim,
  ClaimDetails,
  ClaimDocument,
  ClaimStatus,
  ClaimType,
  CommunicationLogEntry,
  DecisionOutcome,
  ExpertInput,
  InfoRequestItem,
  NotificationType,
  Payment,
  Role,
  RulesResult,
} from '../domain/types';
import { delay, getDb, persist, ServiceError } from './db';
import { uid } from './seed';

export interface NewClaimInput {
  policyNumber: string;
  claimType: ClaimType;
  claimantName: string;
  dateOfLoss: string;
  location: { city: string; state: string };
  incidentDescription: string;
  estimatedAmount: number;
  estimatedFields: string[];
  details: ClaimDetails;
  documents: NewDocumentInput[];
  tags?: string[];
}

export type NewDocumentInput = Omit<ClaimDocument, 'id' | 'uploadedBy' | 'uploadedAt'>;

export interface DecisionInput {
  outcome: DecisionOutcome;
  approvedAmount: number;
  overrideReason?: string;
  denialReasonCode?: string;
  explanation: string;
}

export interface ClaimFilter {
  claimType?: ClaimType;
  status?: ClaimStatus;
  policyNumbers?: string[];
  providerName?: string;
}

// ---------- internals ----------

const nowIso = () => new Date().toISOString();

function find(claimNumber: string): Claim {
  const c = getDb().claims.find((x) => x.claimNumber === claimNumber);
  if (!c) throw new ServiceError(`Claim ${claimNumber} not found`, 'NOT_FOUND');
  return c;
}

function audit(c: Claim, actor: Actor | 'SYSTEM', action: string, extra: Partial<AuditEntry> = {}) {
  const entry: AuditEntry = {
    id: uid('aud'),
    timestamp: nowIso(),
    actor: actor === 'SYSTEM' ? 'ClaimEase' : actor.name,
    role: actor === 'SYSTEM' ? 'SYSTEM' : actor.role,
    action,
    ...extra,
  };
  // Append-only: entries are never edited or removed.
  c.auditTrail.push(Object.freeze(entry) as AuditEntry);
  c.updatedAt = entry.timestamp;
}

function filerAudience(c: Claim): Role[] {
  return c.claimType === 'HEALTH' ? ['PROVIDER', 'CLAIMANT'] : ['CLAIMANT'];
}

function notify(c: Claim, audience: Role[], type: NotificationType, title: string, message: string) {
  const n: AppNotification = {
    id: uid('nt'),
    claimNumber: c.claimNumber,
    audience,
    type,
    title,
    message: `${c.claimNumber}: ${message}`,
    createdAt: nowIso(),
    read: false,
  };
  getDb().notifications.unshift(n);
}

function evaluate(c: Claim): RulesResult {
  const db = getDb();
  const policy = db.policies.find((p) => p.policyNumber === c.policyNumber);
  return evaluateClaim(c, policy, { otherClaims: db.claims, config: db.config });
}

function startSla(c: Claim, from = nowIso()) {
  const r = evaluate(c);
  c.slaStartedAt = from;
  c.slaDueDate = computeSlaDueDate(
    {
      claimType: c.claimType,
      createdAt: from,
      complexity: r.complexity,
      healthServiceType: c.details.kind === 'HEALTH' ? c.details.serviceType : undefined,
    },
    getDb().config,
  );
  return r;
}

function setStatus(c: Claim, to: ClaimStatus, actor: Actor | 'SYSTEM', details?: string) {
  const from = c.status;
  assertTransition(from, to, actor === 'SYSTEM' ? undefined : actor.role);
  c.status = to;
  audit(c, actor, 'Status changed', { fromStatus: from, toStatus: to, details });
}

function guardStaff(actor: Actor) {
  if (actor.role !== 'ADJUSTER' && actor.role !== 'ADMIN') throw new ServiceError('Only adjusters and admins can do this.', 'FORBIDDEN');
}

async function commit(c: Claim): Promise<Claim> {
  persist();
  return delay(c);
}

function makeDocs(inputs: NewDocumentInput[], actor: Actor): ClaimDocument[] {
  return inputs.map((d) => ({ ...d, id: uid('doc'), uploadedBy: actor.name, uploadedAt: nowIso() }));
}

// ---------- public API ----------

export const claimService = {
  async list(filter: ClaimFilter = {}): Promise<Claim[]> {
    let list = getDb().claims;
    if (filter.claimType) list = list.filter((c) => c.claimType === filter.claimType);
    if (filter.status) list = list.filter((c) => c.status === filter.status);
    if (filter.policyNumbers) list = list.filter((c) => filter.policyNumbers!.includes(c.policyNumber));
    if (filter.providerName)
      list = list.filter((c) => c.details.kind === 'HEALTH' && c.details.provider.name === filter.providerName);
    return delay([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async get(claimNumber: string): Promise<Claim> {
    return delay(find(claimNumber));
  },

  async evaluate(claimNumber: string): Promise<RulesResult> {
    return delay(evaluate(find(claimNumber)), 80);
  },

  /** FNOL submission: REPORTED → REGISTERED, claim number generated, SLA started. */
  async create(input: NewClaimInput, actor: Actor): Promise<Claim> {
    const db = getDb();
    const policy = db.policies.find((p) => p.policyNumber === input.policyNumber);
    if (!policy) throw new ServiceError('Policy not found', 'NOT_FOUND');
    if (policy.status !== 'ACTIVE') throw new ServiceError('Policy is not active');
    if (!input.dateOfLoss) throw new ServiceError('The date it happened is required');
    const now = nowIso();
    const claim: Claim = {
      id: uid('claim'),
      claimNumber: nextClaimNumber(db.claims.map((c) => c.claimNumber)),
      policyNumber: input.policyNumber,
      claimType: input.claimType,
      initiatorRole: actor.role,
      claimantName: input.claimantName,
      dateOfLoss: input.dateOfLoss,
      location: input.location,
      incidentDescription: input.incidentDescription,
      estimatedAmount: input.estimatedAmount,
      estimatedFields: input.estimatedFields,
      details: input.details,
      documents: makeDocs(input.documents, actor),
      status: 'REPORTED',
      notes: [],
      communicationLog: [],
      informationRequests: [],
      expertInputs: [],
      decisionHistory: [],
      appeals: [],
      auditTrail: [],
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      slaDueDate: now,
    };
    audit(claim, actor, 'Claim filed', { toStatus: 'REPORTED', details: `Filed via ClaimEase portal by ${actor.name}` });
    if (claim.documents.length)
      audit(claim, actor, 'Documents uploaded', { details: `${claim.documents.length} file(s): ${claim.documents.map((d) => d.fileName).join(', ')}` });
    db.claims.push(claim);
    setStatus(claim, 'REGISTERED', 'SYSTEM', `Claim number ${claim.claimNumber} issued`);
    const r = startSla(claim, now);
    audit(claim, 'SYSTEM', 'Rules engine evaluated', {
      details: `Uncertainty ${r.uncertaintyScore}/100 · ${r.complexity} complexity · ${r.fastTrackEligible ? 'fast-track eligible' : `review triggers: ${r.triggers.map((t) => t.label).join(', ') || 'none'}`}`,
    });
    notify(claim, filerAudience(claim), 'STATUS', 'Claim registered', `your ${claim.claimType.toLowerCase()} claim was registered.`);
    notify(claim, ['ADJUSTER', 'ADMIN'], 'ASSIGNMENT', 'New claim registered', `${claim.claimType.toLowerCase()} claim from ${claim.claimantName} is awaiting assignment.`);
    return commit(claim);
  },

  async transition(claimNumber: string, to: ClaimStatus, actor: Actor, details?: string): Promise<Claim> {
    const c = find(claimNumber);
    if (!canTransition(c.status, to, actor.role))
      throw new ServiceError(`Cannot move from ${STATUS_LABELS[c.status]} to ${STATUS_LABELS[to]} as ${actor.role.toLowerCase()}.`, 'CONFLICT');
    setStatus(c, to, actor, details);
    if (to === 'UNDER_REVIEW' && !c.assignedAdjuster && actor.role === 'ADJUSTER') {
      c.assignedAdjuster = actor.name;
      audit(c, actor, 'Assigned', { details: `Assigned to ${actor.name}` });
    }
    if (to === 'REOPENED') {
      c.decidedAt = undefined;
      startSla(c);
    }
    if (to === 'CLOSED') notify(c, filerAudience(c), 'STATUS', 'Claim closed', 'your claim has been closed.');
    else if (to === 'INVESTIGATION') notify(c, filerAudience(c), 'STATUS', 'Claim under investigation', 'additional investigation is under way. No action needed right now.');
    else notify(c, filerAudience(c), 'STATUS', `Status: ${STATUS_LABELS[to]}`, `status changed to ${STATUS_LABELS[to].toLowerCase()}.`);
    return commit(c);
  },

  async assign(claimNumber: string, adjuster: string, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    const prev = c.assignedAdjuster;
    c.assignedAdjuster = adjuster;
    audit(c, actor, prev ? 'Reassigned' : 'Assigned', { details: prev ? `${prev} → ${adjuster}` : `Assigned to ${adjuster}` });
    if (c.status === 'REGISTERED' || c.status === 'REOPENED') setStatus(c, 'UNDER_REVIEW', actor, 'Review started on assignment');
    return commit(c);
  },

  async addNote(claimNumber: string, text: string, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    if (!text.trim()) throw new ServiceError('Note cannot be empty');
    c.notes.push({ id: uid('note'), author: actor.name, role: actor.role, createdAt: nowIso(), text: text.trim() });
    audit(c, actor, 'Note added', { details: text.trim().slice(0, 120) });
    return commit(c);
  },

  async addCommunication(claimNumber: string, entry: Omit<CommunicationLogEntry, 'id' | 'loggedBy' | 'loggedByRole'>, actor: Actor): Promise<Claim> {
    const c = find(claimNumber);
    if (!entry.summary.trim()) throw new ServiceError('Summary is required');
    c.communicationLog.push({ ...entry, id: uid('cl'), loggedBy: actor.name, loggedByRole: actor.role });
    audit(c, actor, 'Communication logged', { details: `${entry.channel.toLowerCase()} with ${entry.contactPerson}: ${entry.summary.slice(0, 100)}` });
    return commit(c);
  },

  async addDocuments(claimNumber: string, docs: NewDocumentInput[], actor: Actor): Promise<Claim> {
    const c = find(claimNumber);
    if (c.status === 'CLOSED') throw new ServiceError('Closed claims cannot receive documents. Reopen the claim first.');
    const created = makeDocs(docs, actor);
    c.documents.push(...created);
    // Mark matching info request items as fulfilled.
    const open = c.informationRequests.filter((r) => !r.respondedAt);
    for (const d of created) {
      for (const r of open) {
        const item = r.items.find((i) => !i.fulfilled && (i.id === d.satisfiesRequestItemId || (!d.satisfiesRequestItemId && i.category === d.category)));
        if (item) item.fulfilled = true;
      }
    }
    audit(c, actor, 'Documents uploaded', { details: `${created.length} file(s): ${created.map((d) => d.fileName).join(', ')}` });
    if (actor.role === 'CLAIMANT' || actor.role === 'PROVIDER')
      notify(c, ['ADJUSTER'], 'STATUS', 'New documents received', `${actor.name} uploaded ${created.length} document(s).`);
    return commit(c);
  },

  async requestInformation(claimNumber: string, items: Omit<InfoRequestItem, 'id' | 'fulfilled'>[], message: string, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    if (!items.length) throw new ServiceError('Choose at least one item to request');
    c.informationRequests.push({
      id: uid('ir'),
      requestedAt: nowIso(),
      requestedBy: actor.name,
      message,
      items: items.map((i) => ({ ...i, id: uid('iri'), fulfilled: false })),
    });
    setStatus(c, 'INFORMATION_REQUIRED', actor, `Requested: ${items.map((i) => i.label).join(', ')}`);
    notify(c, filerAudience(c), 'INFO_REQUEST', 'Information requested', `please provide: ${items.map((i) => i.label).join(', ')}.`);
    return commit(c);
  },

  /** Claimant/provider responds to an info request: INFORMATION_REQUIRED → UNDER_REVIEW. */
  async submitInformation(claimNumber: string, response: string, actor: Actor): Promise<Claim> {
    const c = find(claimNumber);
    const open = c.informationRequests.filter((r) => !r.respondedAt);
    for (const r of open) {
      r.respondedAt = nowIso();
      // Non-document items are answered by the written response.
      if (response.trim()) for (const i of r.items) if (!i.category) i.fulfilled = true;
    }
    setStatus(c, 'UNDER_REVIEW', actor, response.trim() ? `Response: ${response.trim().slice(0, 160)}` : 'Requested items submitted');
    notify(c, ['ADJUSTER'], 'STATUS', 'Requested information received', `${actor.name} responded to the information request.`);
    return commit(c);
  },

  async recordExpertInput(claimNumber: string, input: Omit<ExpertInput, 'id' | 'requestedAt'>, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    const now = nowIso();
    c.expertInputs.push({ ...input, id: uid('ex'), requestedAt: now, receivedAt: input.status === 'RECEIVED' ? now : undefined });
    audit(c, actor, input.status === 'RECEIVED' ? 'Expert input recorded' : 'Expert input requested', {
      details: `${input.expertType.toLowerCase().replace('_', ' ')}: ${input.expertName}${input.summary ? ` — ${input.summary}` : ''}${
        input.recommendedAmount ? ` (recommends ${formatUSD(input.recommendedAmount)})` : ''
      }`,
    });
    return commit(c);
  },

  async completeExpertInput(claimNumber: string, expertId: string, summary: string, recommendedAmount: number | undefined, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    const e = c.expertInputs.find((x) => x.id === expertId);
    if (!e) throw new ServiceError('Expert input not found', 'NOT_FOUND');
    e.status = 'RECEIVED';
    e.receivedAt = nowIso();
    e.summary = summary;
    e.recommendedAmount = recommendedAmount;
    audit(c, actor, 'Expert input recorded', { details: `${e.expertName}: ${summary}` });
    return commit(c);
  },

  async decide(claimNumber: string, input: DecisionInput, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    if (c.status === 'UNDER_REVIEW' || c.status === 'INVESTIGATION' || c.status === 'APPEALED')
      setStatus(c, 'ADJUDICATION', actor, c.status === 'UNDER_REVIEW' ? 'Fast-track to decision' : undefined);
    if (c.status !== 'ADJUDICATION') throw new ServiceError('The claim must be at the decision step before a decision can be recorded.', 'CONFLICT');
    const r = evaluate(c);
    if (input.outcome === 'DENIED') {
      if (!input.denialReasonCode) throw new ServiceError('A denial requires a reason code.');
      if (input.explanation.trim().length < 10) throw new ServiceError('A denial requires an explanation (10+ characters).');
    }
    const approvedAmount = input.outcome === 'DENIED' ? 0 : Math.max(0, input.approvedAmount);
    const overridden = input.outcome !== 'DENIED' && Math.abs(approvedAmount - r.payable.payable) >= 0.01;
    if (overridden && !input.overrideReason?.trim()) throw new ServiceError('Overriding the calculated amount requires a reason.');
    if (input.outcome === 'APPROVED' && approvedAmount <= 0) throw new ServiceError('Approved amount must be greater than zero.');
    const decidedAt = nowIso();
    c.decision = {
      outcome: input.outcome,
      calculatedAmount: r.payable.payable,
      approvedAmount,
      overrideReason: overridden ? input.overrideReason!.trim() : undefined,
      denialReasonCode: input.outcome === 'DENIED' ? input.denialReasonCode : undefined,
      explanation: input.explanation.trim(),
      decidedBy: actor.name,
      decidedAt,
    };
    c.decisionHistory.push(c.decision);
    c.decidedAt = decidedAt;
    const reason = DENIAL_REASON_CODES.find((d) => d.code === input.denialReasonCode)?.label;
    setStatus(
      c,
      input.outcome,
      actor,
      input.outcome === 'DENIED'
        ? `${input.denialReasonCode} — ${reason}`
        : `Approved ${formatUSD(approvedAmount)} (calculated ${formatUSD(r.payable.payable)})${overridden ? ` · override: ${input.overrideReason}` : ''}`,
    );
    const label = input.outcome === 'APPROVED' ? 'approved' : input.outcome === 'PARTIALLY_APPROVED' ? 'partially approved' : 'denied';
    notify(
      c,
      filerAudience(c),
      'DECISION',
      `Claim ${label}`,
      input.outcome === 'DENIED'
        ? `your claim was denied (${reason}). You can file an appeal.`
        : `${formatUSD(approvedAmount)} ${label}.${input.outcome === 'PARTIALLY_APPROVED' ? ' You can file an appeal.' : ''}`,
    );
    return commit(c);
  },

  async issuePayment(claimNumber: string, payment: Omit<Payment, 'issuedBy'>, actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    if (c.status === 'APPROVED' || c.status === 'PARTIALLY_APPROVED') setStatus(c, 'PAYMENT_PENDING', actor);
    if (c.status !== 'PAYMENT_PENDING') throw new ServiceError('Claim is not awaiting payment.', 'CONFLICT');
    if (payment.amount <= 0) throw new ServiceError('Payment amount must be greater than zero.');
    c.payment = { ...payment, issuedBy: actor.name };
    setStatus(c, 'PAID', actor, `${payment.method} · ${formatUSD(payment.amount)} · ref ${payment.reference}`);
    const payee = c.claimType === 'HEALTH' && c.details.kind === 'HEALTH' ? c.details.provider.name : c.claimantName;
    notify(c, filerAudience(c), 'PAYMENT', 'Payment issued', `${formatUSD(payment.amount)} paid by ${payment.method} to ${payee}.`);
    return commit(c);
  },

  async fileAppeal(claimNumber: string, reason: string, docs: NewDocumentInput[], actor: Actor): Promise<Claim> {
    const c = find(claimNumber);
    if (!c.decision) throw new ServiceError('There is no decision to appeal.');
    if (reason.trim().length < 20) throw new ServiceError('Please explain the reason for your appeal (20+ characters).');
    const created = makeDocs(docs, actor);
    c.documents.push(...created);
    c.appeals.push({
      id: uid('ap'),
      reason: reason.trim(),
      filedAt: nowIso(),
      filedBy: actor.name,
      documentIds: created.map((d) => d.id),
      previousOutcome: c.decision.outcome,
      previousAmount: c.decision.approvedAmount,
    });
    if (created.length) audit(c, actor, 'Documents uploaded', { details: `Appeal evidence: ${created.map((d) => d.fileName).join(', ')}` });
    setStatus(c, 'APPEALED', actor, reason.trim().slice(0, 160));
    c.decidedAt = undefined;
    startSla(c);
    notify(c, ['ADJUSTER', 'ADMIN'], 'APPEAL', 'Appeal filed', `${actor.name} appealed the ${c.decision.outcome.toLowerCase().replace('_', ' ')} decision.`);
    notify(c, filerAudience(c), 'APPEAL', 'Appeal received', 'your appeal was received and will be looked at by a different reviewer.');
    return commit(c);
  },

  async setTags(claimNumber: string, tags: string[], actor: Actor): Promise<Claim> {
    guardStaff(actor);
    const c = find(claimNumber);
    const before = c.tags.join(', ') || 'none';
    c.tags = tags;
    audit(c, actor, 'Tags updated', { details: `${before} → ${tags.join(', ') || 'none'}` });
    return commit(c);
  },
};

export type ClaimService = typeof claimService;
