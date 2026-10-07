import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../services/seed';
import { buildClaimContext, buildStaffContext } from '../aiContext';
import { evaluateClaim } from '../rulesEngine';
import type { Claim } from '../types';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const base = seed.claims[0];

/** A claim carrying secrets the claimant must never see (and therefore the AI must never see). */
const withSecrets: Claim = {
  ...base,
  notes: [{ id: 'n1', author: 'Alex', role: 'ADJUSTER', createdAt: base.createdAt, text: 'SECRET-NOTE suspected fraud' }],
  expertInputs: [{ id: 'e1', expertType: 'APPRAISER', expertName: 'SECRET-EXPERT', status: 'RECEIVED', requestedAt: base.createdAt, summary: 'SECRET-SUMMARY' }],
  decision: {
    outcome: 'DENIED',
    calculatedAmount: 100,
    approvedAmount: 0,
    overrideReason: 'SECRET-OVERRIDE',
    denialReasonCode: 'D02',
    explanation: 'The loss is excluded under the policy.',
    decidedBy: 'Alex Chen',
    decidedAt: base.createdAt,
  },
  auditTrail: [
    ...base.auditTrail,
    { id: 'a1', timestamp: base.createdAt, actor: 'Alex', role: 'ADJUSTER', action: 'Note added', details: 'SECRET-AUDIT-NOTE' },
    { id: 'a2', timestamp: base.createdAt, actor: 'System', role: 'SYSTEM', action: 'Rules engine evaluated', details: 'SECRET-FRAUD-TRIGGER' },
    { id: 'a3', timestamp: base.createdAt, actor: 'Alex', role: 'ADJUSTER', action: 'Decision recorded', details: 'Denied' },
  ],
};

describe('buildClaimContext (what the claim assistant may see)', () => {
  const json = JSON.stringify(buildClaimContext(withSecrets, new Date('2026-10-06T12:00:00Z')));

  it('leaves out internal notes, expert input, override reasons and rules-engine entries', () => {
    expect(json).not.toMatch(/SECRET/);
  });

  it('leaves out personal details', () => {
    const customer = seed.customers.find((c) => c.name === base.claimantName);
    expect(json).not.toContain(base.claimantName);
    expect(json).not.toContain(base.policyNumber);
    if (customer) {
      expect(json).not.toContain(customer.contact.email);
      expect(json).not.toContain(customer.contact.phone);
      expect(json).not.toContain(customer.contact.address);
    }
  });

  it('includes what the claimant already sees: status, timeline, decision reason, activity', () => {
    const ctx = buildClaimContext(withSecrets, new Date('2026-10-06T12:00:00Z'));
    expect(ctx.status).toBeTruthy();
    expect(ctx.stages.length).toBeGreaterThan(0);
    expect(ctx.decision).toMatchObject({ outcome: 'DENIED', explanation: 'The loss is excluded under the policy.' });
    expect(ctx.decision?.reason).toMatch(/excluded/i); // code D02 translated to words
    expect(ctx.recentActivity.map((a) => a.what).join(' ')).toContain('Decision recorded');
  });

  it('lists what is still needed from the claimant on open information requests', () => {
    const open: Claim = {
      ...base,
      status: 'INFORMATION_REQUIRED',
      informationRequests: [
        {
          id: 'r1',
          requestedAt: base.createdAt,
          requestedBy: 'Alex',
          message: 'Please send the estimate.',
          items: [
            { id: 'i1', label: 'Repair shop estimate', reason: 'MISSING_DOCUMENTS', fulfilled: false },
            { id: 'i2', label: 'Police report', reason: 'MISSING_DOCUMENTS', fulfilled: true },
          ],
        },
      ],
    };
    const ctx = buildClaimContext(open);
    expect(ctx.openRequests).toHaveLength(1);
    expect(ctx.openRequests[0].stillNeeded).toEqual(['Repair shop estimate']);
  });

  it('caps long free text and the activity list', () => {
    const noisy: Claim = {
      ...base,
      auditTrail: Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, timestamp: base.createdAt, actor: 'a', role: 'SYSTEM' as const, action: 'Event', details: 'y'.repeat(500) })),
    };
    const ctx = buildClaimContext(noisy);
    expect(ctx.recentActivity).toHaveLength(8);
    expect(ctx.recentActivity[0].what.length).toBeLessThanOrEqual(200);
  });
});

describe('buildStaffContext (what the adjuster brief may see)', () => {
  const policy = seed.policies.find((p) => p.policyNumber === base.policyNumber);
  const rules = evaluateClaim(base, policy, { otherClaims: seed.claims });
  const staffClaim: Claim = { ...base, notes: [{ id: 'n', author: 'Alex', role: 'ADJUSTER', createdAt: base.createdAt, text: 'Checked the photos, roof looks old.' }] };
  const ctx = buildStaffContext(staffClaim, rules, policy);
  const json = JSON.stringify(ctx);

  it('includes the rules engine analysis, payable calculation and internal notes', () => {
    expect(ctx.checks.length).toBeGreaterThan(0);
    expect(ctx.checks[0]).toHaveProperty('explanation');
    expect(ctx.payable.claimed).toBe(rules.payable.claimed);
    expect(ctx.uncertaintyScore).toBe(rules.uncertaintyScore);
    expect(ctx.notes).toEqual(['Checked the photos, roof looks old.']);
    expect(ctx.policy?.coverages.length).toBeGreaterThan(0);
  });

  it('still leaves out personal details', () => {
    const customer = seed.customers.find((c) => c.name === base.claimantName);
    expect(json).not.toContain(base.claimantName);
    expect(json).not.toContain(base.policyNumber);
    expect(json).not.toContain(base.claimNumber);
    if (customer) {
      expect(json).not.toContain(customer.contact.email);
      expect(json).not.toContain(customer.contact.phone);
    }
  });

  it('scrubs identifiers and names that the rules engine writes into its explanations', () => {
    // A health claim carries the patient's name and member ID; a property/auto one carries the policy number.
    for (const claim of seed.claims) {
      const pol = seed.policies.find((x) => x.policyNumber === claim.policyNumber);
      const text = JSON.stringify(buildStaffContext(claim, evaluateClaim(claim, pol, { otherClaims: seed.claims }), pol));
      expect(text, claim.claimNumber).not.toContain(claim.policyNumber);
      expect(text, claim.claimNumber).not.toContain(claim.claimantName);
      expect(text, claim.claimNumber).not.toContain(claim.claimNumber);
      if (claim.details.kind === 'HEALTH') {
        expect(text).not.toContain(claim.details.memberId);
        expect(text).not.toContain(claim.details.patientName);
      }
    }
  });

  it('counts documents by plain category name', () => {
    expect(ctx.documents.every((d) => /^[A-Z]/.test(d.category) && d.count > 0)).toBe(true);
  });
});
