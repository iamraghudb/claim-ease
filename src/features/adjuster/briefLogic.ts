// What Ease's brief offers the adjuster, and when. Pure functions: the rules engine and the status machine
// stay in charge, the brief only points at things the adjuster could already do. No React, no I/O.

import type { BriefAction } from '../../domain/aiTypes';
import { canTransition } from '../../domain/statusMachine';
import type { ClaimStatus, DecisionOutcome, Role } from '../../domain/types';

export type ActionTone = 'approve' | 'partial' | 'deny' | 'info' | 'look' | 'wait';

export const ACTION_META: Record<BriefAction, { label: string; tone: ActionTone }> = {
  APPROVE: { label: 'Approve', tone: 'approve' },
  PARTIALLY_APPROVE: { label: 'Partially approve', tone: 'partial' },
  DENY: { label: 'Deny', tone: 'deny' },
  REQUEST_INFO: { label: 'Request information', tone: 'info' },
  INVESTIGATE: { label: 'Investigate further', tone: 'look' },
  WAIT: { label: 'Wait for a reply', tone: 'wait' },
};

const DECISION_FOR: Partial<Record<BriefAction, DecisionOutcome>> = {
  APPROVE: 'APPROVED',
  PARTIALLY_APPROVE: 'PARTIALLY_APPROVED',
  DENY: 'DENIED',
};

/** The decision-form choice an action corresponds to, or null when it is not a decision. */
export const decisionFor = (action: BriefAction): DecisionOutcome | null => DECISION_FOR[action] ?? null;

/** Statuses in which a recommendation still makes sense. Once a decision exists, "Ease suggests" would be noise. */
const PENDING_STATUSES: ClaimStatus[] = ['REPORTED', 'REGISTERED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED', 'INVESTIGATION', 'ADJUDICATION', 'APPEALED', 'REOPENED'];
export const awaitsDecision = (status: ClaimStatus) => PENDING_STATUSES.includes(status);

export type BriefCta =
  | { kind: 'request_info'; label: string }
  | { kind: 'decide'; choice: DecisionOutcome; label: string }
  | { kind: 'hint'; text: string }
  | null;

/**
 * The button (or hint) that goes with a recommendation.
 *  - Request information opens the existing modal, when the status machine allows it.
 *  - Approve / partially approve / deny take the adjuster to the decision form, which is only open at the decision step.
 *  - Investigate and wait just inform.
 */
export function briefCta(action: BriefAction, status: ClaimStatus, role: Role): BriefCta {
  if (!awaitsDecision(status)) return null;
  if (action === 'REQUEST_INFO') return canTransition(status, 'INFORMATION_REQUIRED', role) ? { kind: 'request_info', label: 'Choose items to request' } : null;
  const choice = decisionFor(action);
  if (!choice) return null;
  if (status === 'ADJUDICATION') return { kind: 'decide', choice, label: 'Go to decision' };
  return { kind: 'hint', text: 'You can record a decision once the claim is at the decision step.' };
}
