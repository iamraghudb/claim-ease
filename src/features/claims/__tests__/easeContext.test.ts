import { describe, expect, it } from 'vitest';
import { buildClaimContext } from '../../../domain/aiContext';
import { buildSeed } from '../../../services/seed';
import type { Claim } from '../../../domain/types';
import { appealContext, claimPageData, myClaimsPageData, stableClaimContext, STANDARD_QUESTION } from '../easeContext';

const T0 = new Date('2026-10-06T12:00:00Z');
const seed = buildSeed(T0);
const hoursLater = (h: number) => new Date(T0.getTime() + h * 3_600_000);

/** An open claim, so its SLA label ("2d 4h left") ticks as time passes. */
const openClaim = seed.claims.find((c) => buildClaimContext(c, T0).sla.summary !== buildClaimContext(c, hoursLater(3)).sla.summary)!;

describe('stableClaimContext (the cache key for "Where you stand")', () => {
  it('needs a claim whose SLA label ticks, or these tests prove nothing', () => {
    expect(openClaim).toBeDefined();
  });

  it('drops the clock and the ticking SLA label', () => {
    const stable = stableClaimContext(buildClaimContext(openClaim, T0));
    expect(stable).not.toHaveProperty('now');
    expect(stable.sla).not.toHaveProperty('summary');
    expect(Object.keys(stable.sla).sort()).toEqual(['dueDate', 'state']);
  });

  it('is identical when the same claim is opened later, so the remembered answer is reused', () => {
    const early = buildClaimContext(openClaim, T0);
    const late = buildClaimContext(openClaim, hoursLater(3));
    expect(JSON.stringify(early)).not.toBe(JSON.stringify(late)); // the raw context ticks...
    expect(JSON.stringify(stableClaimContext(early))).toBe(JSON.stringify(stableClaimContext(late))); // ...the cache key does not
  });

  it('changes when something real about the claim changes', () => {
    const before = stableClaimContext(buildClaimContext(openClaim, T0));
    const decided: Claim = { ...openClaim, status: 'DENIED', decision: { outcome: 'DENIED', calculatedAmount: 0, approvedAmount: 0, explanation: 'Not covered.', decidedBy: 'Alex', decidedAt: openClaim.createdAt } };
    expect(JSON.stringify(stableClaimContext(buildClaimContext(decided, T0)))).not.toBe(JSON.stringify(before));
  });

  it('keeps everything else the AI needs', () => {
    const ctx = buildClaimContext(openClaim, T0);
    const { sla: _sla, ...rest } = stableClaimContext(ctx);
    const { now: _now, sla: _ctxSla, ...expected } = ctx;
    expect(rest).toEqual(expected);
  });

  it('asks the same question every time', () => {
    expect(STANDARD_QUESTION).toMatch(/where does my claim stand/i);
  });
});

describe('claimPageData (what the claim page tells Ease)', () => {
  const data = claimPageData(openClaim);
  it('has the claim number and the snapshot, but no clock', () => {
    expect(data.claimNumber).toBe(openClaim.claimNumber);
    expect(data).not.toHaveProperty('now');
    expect(data.status).toBeTruthy();
  });
  it('has no personal details', () => {
    const json = JSON.stringify(data);
    expect(json).not.toContain(openClaim.claimantName);
    expect(json).not.toContain(openClaim.policyNumber);
  });
});

describe('appealContext (what an appeal letter may use)', () => {
  const decided: Claim = {
    ...openClaim,
    decision: {
      outcome: 'DENIED',
      calculatedAmount: 120,
      approvedAmount: 0,
      overrideReason: 'SECRET-OVERRIDE',
      denialReasonCode: 'D02',
      explanation: 'The loss is excluded under the policy.',
      decidedBy: 'Alex Chen',
      decidedAt: openClaim.createdAt,
    },
  };

  it('is null until there is a decision', () => {
    expect(appealContext({ ...openClaim, decision: undefined })).toBeNull();
  });

  it('carries the outcome, amount, reason label, explanation and claim type', () => {
    expect(appealContext(decided)).toEqual({
      outcome: 'DENIED',
      approvedAmount: 0,
      reason: 'Loss excluded under policy terms',
      explanation: 'The loss is excluded under the policy.',
      claimType: openClaim.claimType,
    });
  });

  it('uses the reason label, not the code, and leaves out internal fields and people', () => {
    const json = JSON.stringify(appealContext(decided));
    expect(json).not.toContain('D02');
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('Alex Chen');
    expect(json).not.toContain(openClaim.claimantName);
  });

  it('omits the reason when the decision has no reason code', () => {
    const ctx = appealContext({ ...decided, decision: { ...decided.decision!, denialReasonCode: undefined } })!;
    expect(ctx.reason).toBeUndefined();
  });
});

describe('myClaimsPageData (what "My claims" tells Ease)', () => {
  const many: Claim[] = Array.from({ length: 20 }, (_, i) => ({
    ...openClaim,
    claimNumber: `CLM-2026-${String(100 + i).padStart(6, '0')}`,
    createdAt: new Date(T0.getTime() - i * 86_400_000).toISOString(),
    status: i === 19 ? 'INFORMATION_REQUIRED' : 'UNDER_REVIEW',
  }));
  const data = myClaimsPageData(many);

  it('lists at most 15 claims but reports the real total', () => {
    expect(data.claims).toHaveLength(15);
    expect(data.totalClaims).toBe(20);
  });

  it('puts a claim that needs attention first, even when it is the oldest, then newest first', () => {
    expect(data.claims[0]).toMatchObject({ claimNumber: many[19].claimNumber, needsAttention: true });
    expect(data.claims[1].claimNumber).toBe(many[0].claimNumber);
    expect(data.claims[2].claimNumber).toBe(many[1].claimNumber);
  });

  it('shares only the claim number, type, status and attention flag', () => {
    expect(Object.keys(data.claims[1]).sort()).toEqual(['claimNumber', 'claimType', 'needsAttention', 'status']);
    expect(JSON.stringify(data)).not.toContain(openClaim.claimantName);
  });
});
