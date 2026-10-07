// The numbers behind the operations dashboard, as pure functions so the screen and Ease's insights
// are guaranteed to talk about the same figures. No React, no I/O.

import type { DashboardStats } from '../../domain/aiTypes';
import { CLAIM_TYPE_LABELS, DELAY_REASON_LABELS } from '../../domain/catalog';
import { getSlaStatus } from '../../domain/sla';
import { ALL_STATUSES, STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim, ClaimType, DelayReason, RulesConfig, RulesResult } from '../../domain/types';

const HOUR = 3_600_000;
const MAX_DELAY_REASONS = 6;

/** Rules-engine results by claim number (what `useAllRules()` returns). */
export type RulesByClaim = ReadonlyMap<string, RulesResult>;

/** The headline figures the dashboard cards show, before any rounding for display. */
export interface DashboardFigures {
  total: number;
  /** Claims that have a recorded decision. */
  decided: number;
  /** Average hours from filing to first decision, or null when nothing has been decided yet. */
  avgHours: number | null;
  fastPct: number;
  infoPct: number;
  denialRate: number;
  /** Claims challenged after a decision. */
  appealed: number;
  /** Every delay reason that affects at least one claim, biggest first. */
  delays: { reason: DelayReason; count: number }[];
}

/** Claims that are not paid or closed: the ones still waiting on someone (same rule as the work queue). */
export const isOpenClaim = (c: Pick<Claim, 'status'>) => c.status !== 'CLOSED' && c.status !== 'PAID';

export function computeFigures(claims: readonly Claim[], rules: RulesByClaim): DashboardFigures {
  const total = claims.length;

  const firstDecisionHours = claims
    .filter((c) => c.decidedAt)
    .map((c) => {
      const first = c.decisionHistory[0]?.decidedAt ?? c.decidedAt!;
      return (new Date(first).getTime() - new Date(c.createdAt).getTime()) / HOUR;
    });
  const avgHours = firstDecisionHours.length ? firstDecisionHours.reduce((a, b) => a + b, 0) / firstDecisionHours.length : null;

  const fastTracked = claims.filter((c) => rules.get(c.claimNumber)?.fastTrackEligible || c.auditTrail.some((a) => /fast-track/i.test(a.details ?? ''))).length;
  const everInfo = claims.filter((c) => c.informationRequests.length > 0 || c.status === 'INFORMATION_REQUIRED').length;
  const outcomes = claims.flatMap((c) => (c.decisionHistory.length ? [c.decisionHistory.at(-1)!.outcome] : []));
  const denied = outcomes.filter((o) => o === 'DENIED').length;

  const counts = new Map<DelayReason, number>();
  for (const c of claims) {
    const reasons = new Set<DelayReason>();
    rules.get(c.claimNumber)?.triggers.forEach((t) => reasons.add(t.delayReason));
    c.informationRequests.forEach((r) => r.items.forEach((i) => reasons.add(i.reason)));
    if (c.appeals.length) reasons.add('VALUE_DISAGREEMENT');
    if (c.expertInputs.length) reasons.add('THIRD_PARTIES');
    reasons.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  }
  const delays = (Object.keys(DELAY_REASON_LABELS) as DelayReason[])
    .map((reason) => ({ reason, count: counts.get(reason) ?? 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    total,
    decided: outcomes.length,
    avgHours,
    fastPct: total ? (fastTracked / total) * 100 : 0,
    infoPct: total ? (everInfo / total) * 100 : 0,
    denialRate: outcomes.length ? (denied / outcomes.length) * 100 : 0,
    appealed: claims.filter((c) => c.appeals.length).length,
    delays,
  };
}

const round = (n: number, places = 0) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * What Ease is told about operations. Counts and plain labels only: no claim numbers, names or amounts.
 * `now` decides which open claims are at risk or overdue, using the live SLA settings.
 */
export function computeDashboardStats(claims: readonly Claim[], config: RulesConfig, now: Date, rules: RulesByClaim): DashboardStats {
  const f = computeFigures(claims, rules);

  const byStatus: Record<string, number> = {};
  for (const s of ALL_STATUSES) {
    const n = claims.filter((c) => c.status === s).length;
    if (n > 0) byStatus[STATUS_LABELS[s]] = n;
  }
  const byType: Record<string, number> = {};
  for (const t of Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]) byType[CLAIM_TYPE_LABELS[t]] = claims.filter((c) => c.claimType === t).length;

  const open = claims.filter(isOpenClaim);
  const slaState = (c: Claim) => getSlaStatus(c, now, config).state;

  return {
    totalClaims: f.total,
    decided: f.decided,
    avgDaysToDecision: f.avgHours === null ? null : round(f.avgHours / 24, 1),
    fastTrackPct: round(f.fastPct),
    needInfoPct: round(f.infoPct),
    denialPct: round(f.denialRate),
    appeals: f.appealed,
    byStatus,
    byType,
    topDelayReasons: f.delays.slice(0, MAX_DELAY_REASONS).map((d) => ({ reason: DELAY_REASON_LABELS[d.reason], count: d.count })),
    slaAtRisk: open.filter((c) => slaState(c) === 'AT_RISK').length,
    slaOverdue: open.filter((c) => slaState(c) === 'OVERDUE').length,
  };
}
