import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES_CONFIG } from '../../../domain/config';
import { calculatePayable, evaluateClaim } from '../../../domain/rulesEngine';
import { healthClaim, healthPolicy } from '../../../domain/__tests__/fixtures';
import type { Decision, RulesResult } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { networkSavings, portfolioSavings } from '../networkSavings';
import { remittance } from '../remittance';

// 99214: billed 250, network rate 165. 73721: billed 1150, network rate 850. Together 1400 billed, 1015 allowed.
const payable = calculatePayable(healthClaim(), healthPolicy);
const decided = (outcome: Decision['outcome'], approvedAmount: number) => ({ decision: { outcome, approvedAmount } as Decision });
const undecided = { decision: undefined };

describe('networkSavings (one claim)', () => {
  it('is billed minus the network rate, which is the provider write-off the rules engine already works out', () => {
    const s = networkSavings(remittance(undecided, payable));
    expect(s.billed).toBe(1400);
    expect(s.networkRate).toBe(1015);
    expect(s.saved).toBe(385);
    expect(s.saved).toBe(payable.contractualAdjustment);
    expect(s.percent).toBe(27.5);
    expect(s.applies).toBe(true);
  });

  it('lists the lines that saved the most first', () => {
    const s = networkSavings(remittance(undecided, payable));
    expect(s.lines.map((l) => [l.procedureCode, l.saved])).toEqual([
      ['73721', 300],
      ['99214', 85],
    ]);
    expect(s.lines[0]).toMatchObject({ billed: 1150, networkRate: 850 });
  });

  it('does not count the saving when the claim was denied, because the patient is billed in full', () => {
    const s = networkSavings(remittance(decided('DENIED', 0), payable));
    expect(s.applies).toBe(false);
    expect(s.saved).toBe(0);
    expect(s.lines).toEqual([]);
  });

  it('still counts it when the examiner changed what the plan pays, since the rate itself does not move', () => {
    const s = networkSavings(remittance(decided('PARTIALLY_APPROVED', 287.5), payable));
    expect(s.saved).toBe(385);
    expect(s.applies).toBe(true);
  });

  it('is zero for a claim with no service lines', () => {
    expect(networkSavings({ lines: [], denied: false })).toMatchObject({ billed: 0, saved: 0, percent: 0 });
  });
});

describe('portfolioSavings (the dashboard figure)', () => {
  const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
  const rules = new Map<string, RulesResult>(
    seed.claims.map((c) => [c.claimNumber, evaluateClaim(c, seed.policies.find((p) => p.policyNumber === c.policyNumber), { otherClaims: seed.claims, config: DEFAULT_RULES_CONFIG })]),
  );

  it('only looks at health claims and never reports more saved than was billed', () => {
    const p = portfolioSavings(seed.claims, rules);
    const health = seed.claims.filter((c) => c.details.kind === 'HEALTH');
    expect(p.claims).toBeLessThanOrEqual(health.length);
    expect(p.saved).toBeGreaterThanOrEqual(0);
    expect(p.saved).toBeLessThanOrEqual(p.billed);
  });

  it('adds up the same numbers each claim shows on its own screen', () => {
    const p = portfolioSavings(seed.claims, rules);
    const each = seed.claims
      .filter((c) => c.details.kind === 'HEALTH')
      .map((c) => networkSavings(remittance(c, rules.get(c.claimNumber)!.payable)))
      .filter((s) => s.applies && s.billed > 0);
    expect(p.saved).toBeCloseTo(each.reduce((n, s) => n + s.saved, 0), 2);
    expect(p.claims).toBe(each.length);
  });

  it('is zero when there are no claims', () => {
    expect(portfolioSavings([], new Map())).toEqual({ claims: 0, billed: 0, saved: 0, percent: 0 });
  });
});
