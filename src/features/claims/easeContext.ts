// Pure helpers behind Ease's claimant-facing extras (summary card, appeal drafting, "My claims" snapshot).
// No React and no I/O, so each one is unit-tested. Everything here only uses what the claimant already sees.

import type { ClaimContext } from '../../domain/aiTypes';
import { buildClaimContext } from '../../domain/aiContext';
import { DENIAL_REASON_CODES } from '../../domain/catalog';
import { STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim } from '../../domain/types';

/** What the "Where you stand" card asks Ease. Asked the same way every time, so the answer can be remembered. */
export const STANDARD_QUESTION = 'In two or three plain sentences: where does my claim stand, and what, if anything, do I need to do next?';

export type StableClaimContext = Omit<ClaimContext, 'now' | 'sla'> & { sla: Omit<ClaimContext['sla'], 'summary'> };

/**
 * The claim snapshot with everything that changes just because time passes taken out: the current time and the
 * SLA label ("2d 4h left"). Used only as the cache key for the remembered summary, so reopening the same claim in
 * the same state is a cache hit instead of a new AI call. The real context (with both) is what gets sent.
 */
export function stableClaimContext(ctx: ClaimContext): StableClaimContext {
  const { now: _now, sla, ...rest } = ctx;
  return { ...rest, sla: { state: sla.state, dueDate: sla.dueDate } };
}

/** What the claim page tells Ease it is showing: the claim snapshot (without the clock) plus the claim number. */
export function claimPageData(claim: Claim): Omit<ClaimContext, 'now'> & { claimNumber: string } {
  const { now: _now, ...ctx } = buildClaimContext(claim);
  return { claimNumber: claim.claimNumber, ...ctx };
}

/**
 * The facts an appeal letter may use. Only what the claimant can already read on the Decision card: the outcome,
 * the amount, the reason label and the examiner's explanation. Never the internal override reason or who decided.
 */
export function appealContext(claim: Claim): Record<string, unknown> | null {
  const d = claim.decision;
  if (!d) return null;
  return {
    outcome: d.outcome,
    approvedAmount: d.approvedAmount,
    reason: d.denialReasonCode ? DENIAL_REASON_CODES.find((c) => c.code === d.denialReasonCode)?.label : undefined,
    explanation: d.explanation,
    claimType: claim.claimType,
  };
}

export interface MyClaimsPageData {
  totalClaims: number;
  claims: { claimNumber: string; claimType: string; status: string; needsAttention: boolean }[];
}

/** A short list for the "My claims" screen: claims that need attention first, then newest. No names. */
export function myClaimsPageData(claims: Claim[], limit = 15): MyClaimsPageData {
  const items = claims
    .map((c) => ({ createdAt: c.createdAt, claimNumber: c.claimNumber, claimType: c.claimType, status: STATUS_LABELS[c.status], needsAttention: c.status === 'INFORMATION_REQUIRED' }))
    .sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ createdAt: _createdAt, ...item }) => item);
  return { totalClaims: claims.length, claims: items };
}
