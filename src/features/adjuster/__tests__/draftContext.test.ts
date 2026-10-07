import { describe, expect, it } from 'vitest';
import { evaluateClaim } from '../../../domain/rulesEngine';
import type { Claim, DecisionOutcome, RulesResult } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { decisionDraftRequest, infoRequestDraftRequest, OUTCOME_LABELS } from '../draftContext';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const rulesFor = (claim: Claim) => evaluateClaim(claim, seed.policies.find((p) => p.policyNumber === claim.policyNumber), { otherClaims: seed.claims, config: seed.config });
const claim = seed.claims.find((c) => c.claimType === 'HEALTH' && c.status === 'ADJUDICATION')!;
const rules = rulesFor(claim);

/** The rules engine writes names and identifiers into its explanations. The draft must not carry them. */
const withChecks = (): RulesResult => ({
  ...rules,
  checks: [
    { id: 'POLICY_ACTIVE', label: 'Policy active', status: 'PASS', explanation: `Policy ${claim.policyNumber} is ACTIVE` },
    { id: 'ELIGIBILITY', label: 'Member eligibility', status: 'FAIL', explanation: `${claim.claimantName} is not an eligible member on ${claim.policyNumber}` },
    { id: 'REQUIRED_DOCS', label: 'Required documents', status: 'WARN', explanation: `Claim ${claim.claimNumber} is missing an itemized bill` },
  ],
});

describe('decisionDraftRequest', () => {
  const ctx = (outcome: DecisionOutcome, over: { approvedAmount?: number; reasonCode?: string; rules?: RulesResult } = {}) =>
    decisionDraftRequest({ claim, rules: over.rules ?? rules, outcome, approvedAmount: over.approvedAmount ?? 100, reasonCode: over.reasonCode }).context as Record<string, unknown>;

  it('asks for a decision explanation', () => {
    expect(decisionDraftRequest({ claim, rules, outcome: 'APPROVED', approvedAmount: 1 }).kind).toBe('decision_explanation');
  });

  it('carries the outcome in words, the amounts and the claim type in words', () => {
    const c = ctx('PARTIALLY_APPROVED', { approvedAmount: 123.456 });
    expect(c.outcome).toBe('Partially approved');
    expect(c.approvedAmount).toBe(123.46);
    expect(c.calculatedPayable).toBe(rules.payable.payable);
    expect(c.amountClaimed).toBe(claim.estimatedAmount);
    expect(c.claimType).toBe('Health');
  });

  it('has a plain label for every outcome', () => {
    expect(Object.keys(OUTCOME_LABELS)).toEqual(['APPROVED', 'PARTIALLY_APPROVED', 'DENIED']);
    for (const label of Object.values(OUTCOME_LABELS)) expect(label).toMatch(/^[A-Z][a-z]+( [a-z]+)?$/);
  });

  it('records a denial as zero and gives the reason as words, not just the code', () => {
    const c = ctx('DENIED', { approvedAmount: 999, reasonCode: 'D02' });
    expect(c.approvedAmount).toBe(0);
    expect(c.denialReason).toBe('Loss excluded under policy terms');
    expect(c.reason).toBe(c.denialReason);
    expect(JSON.stringify(c)).not.toContain('D02');
  });

  it('leaves the reason out when nothing is chosen yet, and for approvals', () => {
    expect(ctx('DENIED')).not.toHaveProperty('denialReason');
    expect(ctx('APPROVED', { reasonCode: 'D02' })).not.toHaveProperty('denialReason');
  });

  it('lists only the checks that failed or need attention', () => {
    const c = ctx('DENIED', { rules: withChecks() });
    expect(c.checks).toEqual([
      expect.objectContaining({ label: 'Member eligibility', result: 'failed' }),
      expect.objectContaining({ label: 'Required documents', result: 'needs attention' }),
    ]);
  });

  it('carries no names, claim numbers or policy numbers, even from the rules engine text', () => {
    const json = JSON.stringify(ctx('DENIED', { rules: withChecks(), reasonCode: 'D04' }));
    expect(json).not.toContain(claim.claimantName);
    expect(json).not.toContain(claim.claimNumber);
    expect(json).not.toContain(claim.policyNumber);
    expect(json).toContain('the claimant');
  });

  it('is clean for every sample claim', () => {
    for (const c of seed.claims) {
      const json = JSON.stringify(decisionDraftRequest({ claim: c, rules: rulesFor(c), outcome: 'APPROVED', approvedAmount: 10 }));
      expect(json, c.claimNumber).not.toContain(c.claimantName);
      expect(json, c.claimNumber).not.toContain(c.claimNumber);
      expect(json, c.claimNumber).not.toContain(c.policyNumber);
    }
  });
});

describe('infoRequestDraftRequest', () => {
  it('sends only the labels of the chosen items', () => {
    expect(infoRequestDraftRequest(['Police report', 'Photos of all damaged areas'])).toEqual({
      kind: 'info_request_message',
      context: { items: ['Police report', 'Photos of all damaged areas'] },
    });
  });

  it('copies the list, so later edits to the form cannot change the request', () => {
    const items = ['Itemized bill'];
    const req = infoRequestDraftRequest(items);
    items.push('Medical records');
    expect((req.context as { items: string[] }).items).toEqual(['Itemized bill']);
  });
});
