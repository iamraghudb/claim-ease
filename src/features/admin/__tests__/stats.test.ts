import { describe, expect, it } from 'vitest';
import { evaluateClaim } from '../../../domain/rulesEngine';
import type { Claim, RulesResult } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { computeDashboardStats, computeFigures, isOpenClaim } from '../stats';

const NOW = new Date('2026-10-06T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

const seed = buildSeed(NOW);
const rulesFor = (claims: Claim[]): Map<string, RulesResult> =>
  new Map(claims.map((c) => [c.claimNumber, evaluateClaim(c, seed.policies.find((p) => p.policyNumber === c.policyNumber), { otherClaims: claims, config: seed.config })]));

const stats = (claims: Claim[]) => computeDashboardStats(claims, seed.config, NOW, rulesFor(claims));
const underReview = seed.claims.find((c) => c.status === 'UNDER_REVIEW')!;

describe('computeDashboardStats on the sample data', () => {
  const s = stats(seed.claims);

  it('counts every claim once by status and by type, using plain labels', () => {
    expect(s.totalClaims).toBe(seed.claims.length);
    expect(Object.values(s.byStatus).reduce((a, b) => a + b, 0)).toBe(seed.claims.length);
    expect(Object.values(s.byType).reduce((a, b) => a + b, 0)).toBe(seed.claims.length);
    expect(Object.keys(s.byStatus)).toContain('Under review');
    expect(Object.keys(s.byType)).toEqual(['Auto', 'Property', 'Health']);
    expect(Object.keys(s.byStatus).join(' ')).not.toMatch(/_/);
  });

  it('agrees with the figures the dashboard cards show', () => {
    const f = computeFigures(seed.claims, rulesFor(seed.claims));
    expect(s.decided).toBe(f.decided);
    expect(s.decided).toBe(seed.claims.filter((c) => c.decisionHistory.length).length);
    expect(s.appeals).toBe(f.appealed);
    expect(s.fastTrackPct).toBe(Math.round(f.fastPct));
    expect(s.needInfoPct).toBe(Math.round(f.infoPct));
    expect(s.denialPct).toBe(Math.round(f.denialRate));
    expect(s.avgDaysToDecision).toBeCloseTo(f.avgHours! / 24, 1);
  });

  it('reports percentages as whole numbers between 0 and 100', () => {
    for (const p of [s.fastTrackPct, s.needInfoPct, s.denialPct]) {
      expect(Number.isInteger(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('lists delay reasons in words, biggest first, without zero counts', () => {
    expect(s.topDelayReasons.length).toBeGreaterThan(0);
    expect(s.topDelayReasons.length).toBeLessThanOrEqual(6);
    expect(s.topDelayReasons.every((d) => d.count > 0 && /^[A-Z][a-z]/.test(d.reason) && !d.reason.includes('_'))).toBe(true);
    const counts = s.topDelayReasons.map((d) => d.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('carries no claim numbers, names or policy numbers, and survives JSON', () => {
    const json = JSON.stringify(s);
    for (const c of seed.claims) {
      expect(json).not.toContain(c.claimNumber);
      expect(json).not.toContain(c.claimantName);
      expect(json).not.toContain(c.policyNumber);
    }
    expect(JSON.parse(json)).toEqual(s);
  });
});

describe('averages and rates', () => {
  it('has no average (null) and zero rates when nothing is decided', () => {
    const open = [{ ...underReview, decidedAt: undefined, decisionHistory: [] }];
    const s = stats(open);
    expect(s.avgDaysToDecision).toBeNull();
    expect(s.decided).toBe(0);
    expect(s.denialPct).toBe(0);
  });

  it('handles no claims at all', () => {
    const s = stats([]);
    expect(s).toMatchObject({ totalClaims: 0, decided: 0, avgDaysToDecision: null, fastTrackPct: 0, needInfoPct: 0, denialPct: 0, appeals: 0, byStatus: {}, topDelayReasons: [], slaAtRisk: 0, slaOverdue: 0 });
  });

  it('measures filing to the first decision, rounded to a tenth of a day', () => {
    const created = NOW.getTime() - 10 * DAY;
    const decision = { outcome: 'APPROVED' as const, calculatedAmount: 100, approvedAmount: 100, explanation: 'ok', decidedBy: 'a', decidedAt: iso(created + 60 * HOUR) };
    const a: Claim = { ...underReview, claimNumber: 'CLM-2026-009001', createdAt: iso(created), decidedAt: decision.decidedAt, decisionHistory: [decision] };
    // 60 h = 2.5 days. A later re-decision (after an appeal) does not change "first decision".
    const b: Claim = {
      ...a,
      claimNumber: 'CLM-2026-009002',
      decisionHistory: [{ ...decision, decidedAt: iso(created + 36 * HOUR) }, { ...decision, outcome: 'DENIED', decidedAt: iso(created + 200 * HOUR) }],
      decidedAt: iso(created + 200 * HOUR),
    };
    expect(stats([a]).avgDaysToDecision).toBe(2.5);
    expect(stats([b]).avgDaysToDecision).toBe(1.5);
    // The denial rate looks at the latest decision.
    expect(stats([b]).denialPct).toBe(100);
    expect(stats([a, b]).avgDaysToDecision).toBe(2);
    expect(stats([a, b]).denialPct).toBe(50);
  });
});

describe('SLA counts', () => {
  const at = (over: Partial<Claim>): Claim => ({ ...underReview, claimNumber: 'CLM-2026-009100', slaStartedAt: undefined, ...over });

  it('counts open claims that are overdue or at risk against the live settings', () => {
    const overdue = at({ claimNumber: 'CLM-2026-009101', createdAt: iso(NOW.getTime() - 20 * DAY), slaDueDate: iso(NOW.getTime() - HOUR) });
    const atRisk = at({ claimNumber: 'CLM-2026-009102', createdAt: iso(NOW.getTime() - 9 * DAY), slaDueDate: iso(NOW.getTime() + DAY) });
    const fine = at({ claimNumber: 'CLM-2026-009103', createdAt: iso(NOW.getTime() - DAY), slaDueDate: iso(NOW.getTime() + 9 * DAY) });
    const s = stats([overdue, atRisk, fine]);
    expect(s.slaOverdue).toBe(1);
    expect(s.slaAtRisk).toBe(1);
  });

  it('ignores claims that are paused, closed or already decided', () => {
    const late = { createdAt: iso(NOW.getTime() - 20 * DAY), slaDueDate: iso(NOW.getTime() - DAY) };
    const paused = at({ claimNumber: 'CLM-2026-009111', status: 'INFORMATION_REQUIRED', ...late });
    const closed = at({ claimNumber: 'CLM-2026-009112', status: 'CLOSED', ...late });
    const paid = at({ claimNumber: 'CLM-2026-009113', status: 'PAID', ...late });
    const approved = at({ claimNumber: 'CLM-2026-009114', status: 'APPROVED', decidedAt: iso(NOW.getTime() - 15 * DAY), ...late });
    const s = stats([paused, closed, paid, approved]);
    expect(s.slaOverdue).toBe(0);
    expect(s.slaAtRisk).toBe(0);
  });

  it('follows the at-risk threshold in the config', () => {
    const c = at({ createdAt: iso(NOW.getTime() - 5 * DAY), slaDueDate: iso(NOW.getTime() + 5 * DAY) }); // 50% of the window left
    const rules = rulesFor([c]);
    expect(computeDashboardStats([c], { ...seed.config, atRiskThresholdPct: 0.25 }, NOW, rules).slaAtRisk).toBe(0);
    expect(computeDashboardStats([c], { ...seed.config, atRiskThresholdPct: 0.6 }, NOW, rules).slaAtRisk).toBe(1);
  });
});

describe('isOpenClaim', () => {
  it('treats paid and closed claims as finished', () => {
    expect(isOpenClaim({ status: 'PAID' })).toBe(false);
    expect(isOpenClaim({ status: 'CLOSED' })).toBe(false);
    expect(isOpenClaim({ status: 'APPROVED' })).toBe(true);
    expect(isOpenClaim({ status: 'UNDER_REVIEW' })).toBe(true);
  });
});
