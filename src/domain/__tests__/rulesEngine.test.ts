import { describe, expect, it } from 'vitest';
import {
  checkCoverage,
  checkEligibility,
  checkPolicyActive,
  checkRequiredDocuments,
  evaluateClaim,
} from '../rulesEngine';
import { DEFAULT_RULES_CONFIG } from '../config';
import { computeReadiness } from '../readiness';
import { computeSlaDueDate, getSlaStatus } from '../sla';
import { formatClaimNumber, isValidPolicyNumber, nextClaimNumber, normalizePolicyNumber } from '../claimNumber';
import { autoClaim, autoPolicy, doc, healthClaim, healthPolicy, homePolicy } from './fixtures';

const NOW = new Date('2026-10-05T12:00:00Z');

describe('checkPolicyActive', () => {
  it('passes inside the coverage period', () => {
    expect(checkPolicyActive(autoPolicy, '2026-09-20').status).toBe('PASS');
  });
  it('fails before the effective date', () => {
    expect(checkPolicyActive(autoPolicy, '2026-02-01').status).toBe('FAIL');
  });
  it('fails for a lapsed policy', () => {
    expect(checkPolicyActive({ ...autoPolicy, status: 'LAPSED' }, '2026-09-20').status).toBe('FAIL');
  });
  it('fails without a policy', () => {
    expect(checkPolicyActive(undefined, '2026-09-20').status).toBe('FAIL');
  });
});

describe('checkCoverage', () => {
  it('passes a covered collision', () => {
    expect(checkCoverage(autoClaim(), autoPolicy).status).toBe('PASS');
  });
  it('fails an excluded peril', () => {
    const c = { ...autoClaim(), claimType: 'PROPERTY' as const, details: { kind: 'PROPERTY' as const, damageType: 'MOLD' as const, propertyAddress: '418 Maple Ave', areasAffected: 'Bath', habitable: true } };
    expect(checkCoverage(c, homePolicy).status).toBe('FAIL');
  });
  it('warns when a coverage is not on the policy', () => {
    const c = autoClaim();
    if (c.details.kind === 'AUTO') c.details.incidentType = 'HIT_AND_RUN';
    expect(checkCoverage(c, autoPolicy).status).toBe('WARN');
  });
  it('warns on mixed covered / non-covered health lines', () => {
    const c = healthClaim();
    if (c.details.kind === 'HEALTH') c.details.lines.push({ procedureCode: '15780', diagnosisCode: 'L90.5', units: 1, billedAmount: 500 });
    expect(checkCoverage(c, healthPolicy).status).toBe('WARN');
  });
});

describe('checkEligibility', () => {
  it('fails an unknown health member', () => {
    const c = healthClaim();
    if (c.details.kind === 'HEALTH') c.details.memberId = 'MBR-000000';
    expect(checkEligibility(c, healthPolicy).status).toBe('FAIL');
  });
  it('warns for an unlisted vehicle', () => {
    const c = autoClaim();
    if (c.details.kind === 'AUTO') c.details.vehicle = { make: 'Honda', model: 'Civic', damage: 'door' };
    expect(checkEligibility(c, autoPolicy).status).toBe('WARN');
  });
});

describe('checkRequiredDocuments', () => {
  it('fails when a police report is missing for a multi-party accident', () => {
    const c = autoClaim({ documents: [doc('PHOTO'), doc('REPAIR_ESTIMATE')] });
    const r = checkRequiredDocuments(c);
    expect(r.status).toBe('FAIL');
    expect(r.explanation).toMatch(/Police report/);
  });
  it('warns when values are marked estimated', () => {
    expect(checkRequiredDocuments(autoClaim({ estimatedFields: ['estimatedAmount'] })).status).toBe('WARN');
  });
});

describe('evaluateClaim', () => {
  it('flags a clean, low-value claim as fast-track eligible', () => {
    const r = evaluateClaim(autoClaim(), autoPolicy, { now: NOW });
    expect(r.triggers).toHaveLength(0);
    expect(r.fastTrackEligible).toBe(true);
    expect(r.complexity).toBe('LOW');
    expect(r.priority).toBe('LOW');
    expect(r.checks).toHaveLength(7);
  });

  it('more uncertainty → more review: unknown fault + estimates', () => {
    const c = autoClaim({ estimatedFields: ['estimatedAmount', 'dateOfLoss'] });
    if (c.details.kind === 'AUTO') c.details.otherParties[0].atFault = 'UNKNOWN';
    const clean = evaluateClaim(autoClaim(), autoPolicy, { now: NOW });
    const r = evaluateClaim(c, autoPolicy, { now: NOW });
    expect(r.uncertaintyScore).toBeGreaterThan(clean.uncertaintyScore);
    expect(r.triggers.map((t) => t.code)).toEqual(expect.arrayContaining(['UNCLEAR_LIABILITY', 'ESTIMATED_DATA']));
    expect(r.fastTrackEligible).toBe(false);
    expect(r.needsManualReview).toBe(true);
  });

  it('flags high value claims as HIGH complexity', () => {
    const r = evaluateClaim(autoClaim({ estimatedAmount: 22000 }), autoPolicy, { now: NOW });
    expect(r.triggers.some((t) => t.code === 'HIGH_VALUE')).toBe(true);
    expect(r.complexity).toBe('HIGH');
    expect(r.priority).toBe('HIGH');
  });

  it('respects a configurable high-value threshold', () => {
    const config = { ...DEFAULT_RULES_CONFIG, highValueThreshold: { ...DEFAULT_RULES_CONFIG.highValueThreshold, AUTO: 2000 } };
    const r = evaluateClaim(autoClaim(), autoPolicy, { now: NOW, config });
    expect(r.triggers.some((t) => t.code === 'HIGH_VALUE')).toBe(true);
  });

  it('detects a loss shortly after policy start', () => {
    const r = evaluateClaim(autoClaim({ dateOfLoss: '2026-03-10' }), autoPolicy, { now: NOW });
    expect(r.triggers.some((t) => t.code === 'FRAUD_NEW_POLICY')).toBe(true);
  });

  it('detects a duplicate claim for the same date of loss', () => {
    const other = { claimNumber: 'CLM-2026-000001', policyNumber: 'POL-100245', dateOfLoss: '2026-09-20', createdAt: '2026-09-21T00:00:00Z', status: 'PAID' as const };
    const r = evaluateClaim(autoClaim(), autoPolicy, { now: NOW, otherClaims: [other] });
    expect(r.triggers.some((t) => t.code === 'FRAUD_DUPLICATE')).toBe(true);
  });

  it('detects frequent claims', () => {
    const others = [1, 2, 3, 4, 5].map((i) => ({
      claimNumber: `CLM-2026-00000${i}`,
      policyNumber: 'POL-100245',
      dateOfLoss: `2026-0${i + 3}-01`,
      createdAt: `2026-0${i + 3}-02T00:00:00Z`,
      status: 'CLOSED' as const,
    }));
    const r = evaluateClaim(autoClaim(), autoPolicy, { now: NOW, otherClaims: others });
    expect(r.triggers.some((t) => t.code === 'FRAUD_FREQUENT')).toBe(true);
  });

  it('flags catastrophe-tagged claims as urgent', () => {
    const r = evaluateClaim(autoClaim({ tags: ['CATASTROPHE'] }), autoPolicy, { now: NOW });
    expect(r.triggers.some((t) => t.code === 'CATASTROPHE')).toBe(true);
    expect(r.priority).toBe('URGENT');
  });

  it('flags pending third-party input', () => {
    const r = evaluateClaim(
      autoClaim({ expertInputs: [{ id: 'e', expertType: 'REPAIR_SHOP', expertName: 'Joe’s Body Shop', status: 'PENDING', requestedAt: '2026-09-22' }] }),
      autoPolicy,
      { now: NOW },
    );
    expect(r.triggers.some((t) => t.code === 'THIRD_PARTY_PENDING')).toBe(true);
  });

  it('marks urgent health claims as URGENT priority', () => {
    const c = healthClaim();
    if (c.details.kind === 'HEALTH') c.details.serviceType = 'URGENT';
    expect(evaluateClaim(c, healthPolicy, { now: NOW }).priority).toBe('URGENT');
  });
});

describe('readiness score', () => {
  it('is 100 for a complete claim', () => {
    expect(computeReadiness(autoClaim()).score).toBe(100);
  });
  it('drops for missing documents and gives partial credit for estimates', () => {
    const missing = computeReadiness(autoClaim({ documents: [] }));
    const estimated = computeReadiness(autoClaim({ estimatedFields: ['estimatedAmount'] }));
    expect(missing.score).toBeLessThan(estimated.score);
    expect(estimated.score).toBeLessThan(100);
    expect(missing.missing.map((m) => m.label)).toContain('Police report');
  });
});

describe('SLA', () => {
  it('uses example ERISA windows for health', () => {
    const due = computeSlaDueDate({ claimType: 'HEALTH', createdAt: '2026-10-01T00:00:00Z', complexity: 'LOW', healthServiceType: 'URGENT' });
    expect(due).toBe('2026-10-04T00:00:00.000Z');
  });
  it('uses complexity targets for auto', () => {
    const due = computeSlaDueDate({ claimType: 'AUTO', createdAt: '2026-10-01T00:00:00Z', complexity: 'HIGH' });
    expect(due).toBe('2026-10-31T00:00:00.000Z');
  });
  it('reports overdue, at-risk and paused states', () => {
    const base = { createdAt: '2026-09-01T00:00:00Z', slaDueDate: '2026-10-01T00:00:00Z' };
    expect(getSlaStatus({ ...base, status: 'UNDER_REVIEW' }, NOW).state).toBe('OVERDUE');
    expect(getSlaStatus({ ...base, slaDueDate: '2026-10-07T00:00:00Z', status: 'UNDER_REVIEW' }, NOW).state).toBe('AT_RISK');
    expect(getSlaStatus({ ...base, slaDueDate: '2026-10-30T00:00:00Z', status: 'INFORMATION_REQUIRED' }, NOW).state).toBe('PAUSED');
    expect(getSlaStatus({ ...base, status: 'APPROVED', decidedAt: '2026-09-20T00:00:00Z' }, NOW).state).toBe('MET');
  });
});

describe('claim & policy numbers', () => {
  it('formats claim numbers', () => {
    expect(formatClaimNumber(2026, 42)).toBe('CLM-2026-000042');
  });
  it('continues the highest sequence for the year', () => {
    expect(nextClaimNumber(['CLM-2026-000104', 'CLM-2026-000099', 'CLM-2025-000900'], new Date('2026-10-05'))).toBe('CLM-2026-000105');
    expect(nextClaimNumber([], new Date('2027-01-02'))).toBe('CLM-2027-000001');
  });
  it('validates and normalizes policy numbers', () => {
    expect(isValidPolicyNumber('POL-100245')).toBe(true);
    expect(isValidPolicyNumber('POL-12')).toBe(false);
    expect(normalizePolicyNumber(' pol100245 ')).toBe('POL-100245');
    expect(normalizePolicyNumber('100245')).toBe('POL-100245');
  });
});
