import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES_CONFIG } from '../../../domain/config';
import { calculatePayable, evaluateClaim } from '../../../domain/rulesEngine';
import { healthClaim, healthPolicy } from '../../../domain/__tests__/fixtures';
import type { Decision } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { costContext, healthPageData, remittance } from '../remittance';

// 99214: billed 250, allowed 165, $30 copay, plan pays 135.
// 73721: billed 1150, allowed 850, deductible 300, 20% of 550 = 110, plan pays 440.
const payable = calculatePayable(healthClaim(), healthPolicy);
const decided = (outcome: Decision['outcome'], approvedAmount: number) => ({ decision: { outcome, approvedAmount } as Decision });
const undecided = { decision: undefined };

describe('remittance', () => {
  it('adds up the service lines when nothing was overridden', () => {
    const r = remittance(undecided, payable);
    expect(r.totals).toEqual({ billed: 1400, allowed: 1015, planPaid: 575, patient: 440 });
    expect(r.denied).toBe(false);
  });

  it('pays nothing and bills the patient in full when denied', () => {
    const r = remittance(decided('DENIED', 0), payable);
    expect(r.denied).toBe(true);
    expect(r.totals.planPaid).toBe(0);
    expect(r.totals.patient).toBe(1400);
  });

  it('scales the plan-paid lines when the examiner overrode the total', () => {
    const r = remittance(decided('PARTIALLY_APPROVED', 287.5), payable);
    expect(r.totals.planPaid).toBe(287.5);
    expect(r.totals.patient).toBe(727.5);
  });
});

describe('costContext (what Ease is told about what the person owes)', () => {
  it('is numbers only, taken from the payable breakdown and the remittance totals', () => {
    const ctx = costContext(remittance(undecided, payable), payable);
    expect(ctx).toEqual({
      billed: 1400,
      allowed: 1015,
      deductible: 300,
      copay: 30,
      coinsurance: 110,
      planPaid: 575,
      patientResponsibility: 440,
      providerWriteOff: 385,
    });
    expect(Object.values(ctx).every((v) => typeof v === 'number')).toBe(true);
  });

  it('follows the examiner amount, like the screen does', () => {
    const ctx = costContext(remittance(decided('PARTIALLY_APPROVED', 287.5), payable), payable);
    expect(ctx.planPaid).toBe(287.5);
    expect(ctx.patientResponsibility).toBe(727.5);
  });

  it('zeroes the plan side when the claim was denied, so the numbers agree with what is owed', () => {
    const ctx = costContext(remittance(decided('DENIED', 0), payable), payable);
    expect(ctx).toEqual({ billed: 1400, allowed: 0, deductible: 0, copay: 0, coinsurance: 0, planPaid: 0, patientResponsibility: 1400, providerWriteOff: 0 });
  });

  it('rounds to cents', () => {
    const ctx = costContext(
      { totals: { billed: 100.004, allowed: 80.005, planPaid: 10.1 + 0.2, patient: 70.3 }, denied: false },
      { deductibleApplied: 0, copayApplied: 0, coinsuranceApplied: 0, contractualAdjustment: 19.996 },
    );
    expect(ctx).toMatchObject({ billed: 100, planPaid: 10.3, patientResponsibility: 70.3, providerWriteOff: 20 });
  });
});

describe('healthPageData (what the health screen tells Ease)', () => {
  const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
  const claim = seed.claims.find((c) => c.details.kind === 'HEALTH')!;
  const rules = evaluateClaim(claim, seed.policies.find((p) => p.policyNumber === claim.policyNumber), { otherClaims: seed.claims, config: DEFAULT_RULES_CONFIG });
  const data = healthPageData(claim, remittance(claim, rules.payable), rules.payable, 'Remittance (835)');

  it('has the claim number, what is being viewed and the figures', () => {
    expect(data.claimNumber).toBe(claim.claimNumber);
    expect(data.viewing).toBe('Remittance (835)');
    expect(data.serviceLines.length).toBe(rules.payable.lines?.length ?? 0);
    expect(data.remittance.billed).toBeGreaterThan(0);
  });

  it('has no patient, member or provider details', () => {
    if (claim.details.kind !== 'HEALTH') throw new Error('expected a health claim');
    const json = JSON.stringify(data);
    expect(json).not.toContain(claim.details.patientName);
    expect(json).not.toContain(claim.details.memberId);
    expect(json).not.toContain(claim.details.provider.name);
    expect(json).not.toContain(claim.details.provider.npi);
    expect(json).not.toContain(claim.claimantName);
  });
});
