// What Ease is told about the adjuster's screens (the work queue and a claim review). Small, JSON-safe
// snapshots with no names or contact details. No React, no I/O.

import type { CopilotPage, StaffClaimContext } from '../../domain/aiTypes';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { getSlaStatus, type SlaState } from '../../domain/sla';
import { STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim, Priority, RulesConfig, RulesResult } from '../../domain/types';
import { isOpenClaim } from '../admin/stats';

/** How many claims the queue snapshot lists. */
export const QUEUE_CLAIM_LIMIT = 15;

const SLA_LABELS: Record<SlaState, string> = { ON_TRACK: 'On track', AT_RISK: 'At risk', OVERDUE: 'Overdue', PAUSED: 'Paused', MET: 'Met', MISSED: 'Missed' };
const SLA_RANK: Record<SlaState, number> = { OVERDUE: 0, AT_RISK: 1, ON_TRACK: 2, PAUSED: 3, MET: 4, MISSED: 4 };
const PRIORITY_LABELS: Record<Priority, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The work queue as Ease sees it: the same five counts as the tiles, and the most urgent open claims first. */
export function queuePage(claims: readonly Claim[], rules: ReadonlyMap<string, RulesResult>, config: RulesConfig, now: Date): CopilotPage {
  const open = claims
    .filter(isOpenClaim)
    .map((claim) => ({ claim, sla: getSlaStatus(claim, now, config).state, priority: rules.get(claim.claimNumber)?.priority ?? 'NORMAL' }));
  const counts = {
    open: open.length,
    atRisk: open.filter((r) => r.sla === 'AT_RISK').length,
    overdue: open.filter((r) => r.sla === 'OVERDUE').length,
    fastTrack: open.filter((r) => rules.get(r.claim.claimNumber)?.fastTrackEligible).length,
    unassigned: open.filter((r) => !r.claim.assignedAdjuster).length,
  };
  const urgent = [...open]
    .sort((a, b) => SLA_RANK[a.sla] - SLA_RANK[b.sla] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(a.claim.slaDueDate).getTime() - new Date(b.claim.slaDueDate).getTime())
    .slice(0, QUEUE_CLAIM_LIMIT)
    .map(({ claim, sla, priority }) => ({
      claimNumber: claim.claimNumber,
      type: CLAIM_TYPE_LABELS[claim.claimType],
      status: STATUS_LABELS[claim.status],
      priority: PRIORITY_LABELS[priority],
      slaState: SLA_LABELS[sla],
      amount: claim.estimatedAmount,
    }));
  return {
    path: '/queue',
    title: 'Work queue',
    summary: `${counts.open} open ${counts.open === 1 ? 'claim' : 'claims'}, with tiles and filters for type, status, priority, SLA and owner. The claims listed in the data are the most urgent first.`,
    data: { counts, claims: urgent },
    suggestions: ['What should I work on first?', 'What does "uncertainty" mean here?', 'What is fast-track?'],
  };
}

/** One claim's review screen as Ease sees it: a trimmed copy of what the brief is written from, plus the claim number. */
export function reviewPage(claimNumber: string, ctx: StaffClaimContext): CopilotPage {
  return {
    path: `/queue/${claimNumber}`,
    title: `Claim review ${claimNumber}`,
    summary: `A ${CLAIM_TYPE_LABELS[ctx.claimType]} claim, currently "${ctx.status}": the rules checks, the payable calculation, documents and the decision actions.`,
    data: {
      claimNumber,
      claimType: ctx.claimType,
      status: ctx.status,
      statusMeaning: ctx.statusMeaning,
      description: clip(ctx.description, 240),
      dateOfLoss: ctx.dateOfLoss,
      amountClaimed: ctx.amountClaimed,
      estimatedFields: ctx.estimatedFields,
      uncertaintyScore: ctx.uncertaintyScore,
      complexity: ctx.complexity,
      priority: ctx.priority,
      fastTrackEligible: ctx.fastTrackEligible,
      checks: ctx.checks.map((c) => ({ label: c.label, status: c.status, explanation: clip(c.explanation, 160) })),
      triggers: ctx.triggers.map((t) => ({ label: t.label, explanation: clip(t.explanation, 160) })),
      payable: ctx.payable,
      documents: ctx.documents,
      openInfoRequests: ctx.openInfoRequests,
      notes: ctx.notes.slice(-3).map((n) => clip(n, 160)),
      experts: ctx.experts,
      policy: ctx.policy && { ...ctx.policy, exclusions: ctx.policy.exclusions.slice(0, 6) },
      decision: ctx.decision,
    },
    suggestions: ['What should I look at first?', 'Why is this claim flagged?', 'What would you recommend?'],
  };
}
