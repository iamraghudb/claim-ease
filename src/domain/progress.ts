import { getTimeline } from './statusMachine';
import type { Claim } from './types';

/**
 * 0-100: how far along the lifecycle a claim is. Completed stages count fully, the current stage counts
 * half, and stages that were skipped (for example "Investigation" or "Payment" on a denied claim) are ignored.
 */
export function claimProgressPercent(claim: Pick<Claim, 'status' | 'auditTrail'>): number {
  const stages = getTimeline(claim.status, claim.auditTrail).filter((s) => s.state !== 'skipped');
  if (stages.length === 0) return 0;
  const done = stages.filter((s) => s.state === 'completed').length;
  const current = stages.some((s) => s.state === 'current') ? 0.5 : 0;
  return Math.round(((done + current) / stages.length) * 100);
}
