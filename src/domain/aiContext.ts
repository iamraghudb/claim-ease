import type { ClaimContext, StaffClaimContext } from './aiTypes';
import { DENIAL_REASON_CODES, DOCUMENT_CATEGORY_LABELS } from './catalog';
import { getSlaStatus } from './sla';
import { getTimeline, STATUS_DESCRIPTIONS, STATUS_LABELS } from './statusMachine';
import type { Claim, Policy, RulesResult } from './types';

/** Audit entries a claimant never sees in the UI (see ClaimDetail). The AI must not see them either. */
const INTERNAL_ACTIONS = new Set(['Note added', 'Rules engine evaluated']);

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces the identifiers and names that appear inside free text (the rules engine writes things like
 * "Policy POL-300577 is ACTIVE" and "Maria Lopez (subscriber) is an eligible member") with plain words.
 */
function scrubber(claim: Claim): (text: string) => string {
  const swaps: [string, string][] = [
    [claim.claimNumber, 'this claim'],
    [claim.policyNumber, 'the policy'],
    [claim.claimantName, 'the claimant'],
  ];
  const d = claim.details;
  if (d.kind === 'HEALTH') swaps.push([d.memberId, 'the member'], [d.patientName, 'the patient']);
  if (d.kind === 'AUTO') for (const party of d.otherParties) swaps.push([party.name, 'the other party']);
  const rules = swaps
    .filter(([needle]) => needle.trim().length >= 3)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([needle, plain]) => ({ re: new RegExp(escapeRegExp(needle.trim()), 'gi'), plain }));
  return (text) => rules.reduce((out, r) => out.replace(r.re, r.plain), text);
}

/**
 * Builds the snapshot the claim assistant is allowed to talk about.
 *
 * The rule: the AI sees exactly what the claimant already sees on the claim page and nothing more.
 * Left out on purpose: adjuster notes, expert input, rules-engine triggers (including fraud
 * indicators), override reasons, and personal details (name, address, phone, e-mail, member ID).
 */
export function buildClaimContext(claim: Claim, now: Date = new Date()): ClaimContext {
  const sla = getSlaStatus(claim, now);
  const decision = claim.decision;
  return {
    now: now.toISOString(),
    claimType: claim.claimType,
    status: STATUS_LABELS[claim.status],
    statusMeaning: STATUS_DESCRIPTIONS[claim.status],
    filedOn: claim.createdAt,
    dateOfLoss: claim.dateOfLoss,
    amountClaimed: claim.estimatedAmount,
    stages: getTimeline(claim.status, claim.auditTrail).map((s) => ({ label: s.label, state: s.state, date: s.date })),
    sla: { state: sla.state, summary: sla.label, dueDate: claim.slaDueDate },
    openRequests: claim.informationRequests
      .filter((r) => !r.respondedAt)
      .map((r) => ({
        requestedAt: r.requestedAt,
        message: clip(r.message, 400),
        stillNeeded: r.items.filter((i) => !i.fulfilled).map((i) => i.label),
      })),
    decision: decision && {
      outcome: decision.outcome,
      approvedAmount: decision.approvedAmount,
      reason: decision.denialReasonCode ? DENIAL_REASON_CODES.find((c) => c.code === decision.denialReasonCode)?.label : undefined,
      explanation: clip(decision.explanation, 600),
      decidedAt: decision.decidedAt,
    },
    payment: claim.payment && { method: claim.payment.method, amount: claim.payment.amount, date: claim.payment.date },
    appeals: claim.appeals.map((a) => ({ filedAt: a.filedAt })),
    recentActivity: claim.auditTrail
      .filter((a) => !INTERNAL_ACTIONS.has(a.action))
      .slice(-8)
      .map((a) => ({ when: a.timestamp, what: clip(a.details ? `${a.action}: ${a.details}` : a.action, 200) })),
  };
}

/**
 * The snapshot behind an adjuster's claim brief. Staff may see the rules engine's analysis, internal notes
 * and expert input, but the AI still gets no personal details: no names, contact details or ID numbers.
 */
export function buildStaffContext(claim: Claim, rules: RulesResult, policy?: Policy): StaffClaimContext {
  const p = rules.payable;
  const scrub = scrubber(claim);
  const counts = new Map<string, number>();
  for (const d of claim.documents) counts.set(DOCUMENT_CATEGORY_LABELS[d.category], (counts.get(DOCUMENT_CATEGORY_LABELS[d.category]) ?? 0) + 1);
  return {
    claimType: claim.claimType,
    status: STATUS_LABELS[claim.status],
    statusMeaning: STATUS_DESCRIPTIONS[claim.status],
    description: scrub(clip(claim.incidentDescription, 600)),
    dateOfLoss: claim.dateOfLoss,
    amountClaimed: claim.estimatedAmount,
    estimatedFields: claim.estimatedFields,
    uncertaintyScore: rules.uncertaintyScore,
    complexity: rules.complexity,
    priority: rules.priority,
    fastTrackEligible: rules.fastTrackEligible,
    checks: rules.checks.map((c) => ({ label: c.label, status: c.status, explanation: scrub(clip(c.explanation, 240)) })),
    triggers: rules.triggers.map((t) => ({ label: t.label, explanation: scrub(clip(t.explanation, 240)) })),
    payable: {
      claimed: p.claimed,
      allowed: p.allowed,
      deductible: p.deductibleApplied,
      copay: p.copayApplied,
      coinsurance: p.coinsuranceApplied,
      limitReduction: p.limitReduction,
      payable: p.payable,
      claimantResponsibility: p.claimantResponsibility,
    },
    documents: [...counts].map(([category, count]) => ({ category, count })),
    openInfoRequests: claim.informationRequests.filter((r) => !r.respondedAt).length,
    notes: claim.notes.slice(-5).map((n) => scrub(clip(n.text, 200))),
    experts: claim.expertInputs.map((e) => ({ type: e.expertType, status: e.status, summary: e.summary ? scrub(clip(e.summary, 160)) : undefined })),
    policy: policy && { type: policy.type, deductible: policy.deductible, coverages: policy.coverages.map((c) => c.name), exclusions: policy.exclusions.slice(0, 8) },
    decision: claim.decision && { outcome: claim.decision.outcome, approvedAmount: claim.decision.approvedAmount },
  };
}
