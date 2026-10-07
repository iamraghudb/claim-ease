// The facts Ease may use when it drafts a message for the adjuster. Only what the claimant will be told anyway:
// the outcome, the amounts, the plain-words reason and the rules checks that did not pass (already scrubbed of
// names and identifiers by buildStaffContext). No names, claim numbers or contact details. No React, no I/O.

import type { DraftRequest } from '../../domain/aiTypes';
import { buildStaffContext } from '../../domain/aiContext';
import { CLAIM_TYPE_LABELS, DENIAL_REASON_CODES } from '../../domain/catalog';
import type { Claim, DecisionOutcome, RulesResult } from '../../domain/types';

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially approved',
  DENIED: 'Denied',
};

const cents = (n: number) => Math.round(n * 100) / 100;

/** The decision the adjuster has set up in the form, as a request for an explanation draft. */
export function decisionDraftRequest(input: { claim: Claim; rules: RulesResult; outcome: DecisionOutcome; approvedAmount: number; reasonCode?: string }): DraftRequest {
  const { claim, rules, outcome, reasonCode } = input;
  const denied = outcome === 'DENIED';
  const reason = denied && reasonCode ? DENIAL_REASON_CODES.find((c) => c.code === reasonCode)?.label : undefined;
  const checks = buildStaffContext(claim, rules)
    .checks.filter((c) => c.status !== 'PASS')
    .map((c) => ({ label: c.label, result: c.status === 'FAIL' ? 'failed' : 'needs attention', explanation: c.explanation }));
  return {
    kind: 'decision_explanation',
    context: {
      outcome: OUTCOME_LABELS[outcome],
      approvedAmount: denied ? 0 : cents(input.approvedAmount),
      calculatedPayable: cents(rules.payable.payable),
      amountClaimed: cents(claim.estimatedAmount),
      claimType: CLAIM_TYPE_LABELS[claim.claimType],
      ...(reason && { denialReason: reason, reason }),
      checks,
    },
  };
}

/** The items the adjuster has ticked in the request-information dialog, as a request for a message draft. */
export function infoRequestDraftRequest(itemLabels: readonly string[]): DraftRequest {
  return { kind: 'info_request_message', context: { items: [...itemLabels] } };
}
