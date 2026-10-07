import { describe, expect, it } from 'vitest';
import { calculatePayable } from '../rulesEngine';
import { autoClaim, autoPolicy, doc, healthClaim, healthPolicy, homePolicy } from './fixtures';
import type { EvaluableClaim } from '../rulesEngine';

describe('calculatePayable — property & casualty', () => {
  it('subtracts the deductible', () => {
    const p = calculatePayable(autoClaim({ estimatedAmount: 3200 }), autoPolicy);
    expect(p.deductibleApplied).toBe(500);
    expect(p.payable).toBe(2700);
    expect(p.claimantResponsibility).toBe(500);
  });

  it('never pays a negative amount when the loss is below the deductible', () => {
    const p = calculatePayable(autoClaim({ estimatedAmount: 300 }), autoPolicy);
    expect(p.payable).toBe(0);
    expect(p.deductibleApplied).toBe(300);
    expect(p.claimantResponsibility).toBe(300);
  });

  it('caps at the coverage limit', () => {
    const p = calculatePayable(autoClaim({ estimatedAmount: 40000 }), autoPolicy);
    expect(p.payable).toBe(25000);
    expect(p.limitReduction).toBe(14500);
    expect(p.claimantResponsibility).toBe(15000);
  });

  it('uses an override amount when given (adjuster-adjusted loss)', () => {
    const p = calculatePayable(autoClaim({ estimatedAmount: 8500 }), autoPolicy, 6700);
    expect(p.payable).toBe(6200);
  });

  it('pays nothing for an excluded peril', () => {
    const flood: EvaluableClaim = {
      ...autoClaim(),
      policyNumber: homePolicy.policyNumber,
      claimType: 'PROPERTY',
      estimatedAmount: 18000,
      documents: [doc('PHOTO'), doc('REPAIR_ESTIMATE')],
      details: {
        kind: 'PROPERTY',
        damageType: 'FLOOD',
        propertyAddress: '418 Maple Ave, Austin, TX 78704',
        areasAffected: 'Basement',
        habitable: true,
      },
    };
    const p = calculatePayable(flood, homePolicy);
    expect(p.payable).toBe(0);
    expect(p.notes[0]).toMatch(/excluded/i);
  });

  it('routes property theft to the Personal Property limit', () => {
    const theft: EvaluableClaim = {
      ...autoClaim(),
      claimType: 'PROPERTY',
      estimatedAmount: 14000,
      details: {
        kind: 'PROPERTY',
        damageType: 'THEFT',
        propertyAddress: '418 Maple Ave',
        areasAffected: 'Garage',
        habitable: true,
      },
    };
    const p = calculatePayable(theft, homePolicy);
    expect(p.coverageLimit).toBe(10000);
    expect(p.payable).toBe(10000);
  });

  it('returns zero without a policy', () => {
    expect(calculatePayable(autoClaim(), undefined).payable).toBe(0);
  });
});

describe('calculatePayable — health', () => {
  it('applies fee schedule, copay, remaining deductible and coinsurance', () => {
    // 99214: billed 250, allowed 165 → $30 copay, plan pays 135
    // 73721: billed 1150, allowed 850 → remaining deductible 300, 20% of 550 = 110
    const p = calculatePayable(healthClaim(), healthPolicy);
    expect(p.claimed).toBe(1400);
    expect(p.allowed).toBe(1015);
    expect(p.contractualAdjustment).toBe(385);
    expect(p.copayApplied).toBe(30);
    expect(p.deductibleApplied).toBe(300);
    expect(p.coinsuranceApplied).toBe(110);
    expect(p.claimantResponsibility).toBe(440);
    expect(p.payable).toBe(575);
    expect(p.payable + p.claimantResponsibility).toBe(p.allowed);
  });

  it('charges the copay only once per claim', () => {
    const c = healthClaim();
    if (c.details.kind !== 'HEALTH') throw new Error();
    c.details.lines = [
      { procedureCode: '99213', diagnosisCode: 'J06.9', units: 1, billedAmount: 150 },
      { procedureCode: 'S9083', diagnosisCode: 'J06.9', units: 1, billedAmount: 200 },
    ];
    const p = calculatePayable(c, healthPolicy);
    expect(p.copayApplied).toBe(30);
  });

  it('makes non-covered lines the patient’s responsibility', () => {
    const c = healthClaim();
    if (c.details.kind !== 'HEALTH') throw new Error();
    c.details.lines = [{ procedureCode: '15780', diagnosisCode: 'L90.5', units: 1, billedAmount: 900 }];
    const p = calculatePayable(c, healthPolicy);
    expect(p.payable).toBe(0);
    expect(p.claimantResponsibility).toBe(900);
    expect(p.lines?.[0].covered).toBe(false);
  });

  it('caps patient cost-share at the remaining out-of-pocket maximum', () => {
    const policy = { ...healthPolicy, health: { ...healthPolicy.health!, outOfPocketMet: 5900, deductibleMet: 0 } };
    const c = healthClaim();
    if (c.details.kind !== 'HEALTH') throw new Error();
    c.details.lines = [{ procedureCode: '29881', diagnosisCode: 'S83.241A', units: 1, billedAmount: 6000 }];
    const p = calculatePayable(c, policy);
    // Allowed 4200: deductible 1500 + 20% of 2700 = 2040, capped to 100 remaining OOP
    expect(p.claimantResponsibility).toBe(100);
    expect(p.outOfPocketCapApplied).toBe(1940);
    expect(p.payable).toBe(4100);
  });
});

describe('calculatePayable: dental and vision', () => {
  it('covers them under the Dental and Vision benefits and charges only the coinsurance share, no medical deductible', () => {
    const policy = { ...healthPolicy, coverages: [...healthPolicy.coverages, { name: 'Dental', limit: 0 }, { name: 'Vision', limit: 0 }] };
    const base = healthClaim();
    const claim = {
      ...base,
      details: { ...(base.details as Extract<typeof base.details, { kind: 'HEALTH' }>), lines: [{ procedureCode: 'D0120', diagnosisCode: 'Z01.20', units: 1, billedAmount: 48 }, { procedureCode: '92014', diagnosisCode: 'Z01.00', units: 1, billedAmount: 135 }] },
    };
    const lines = calculatePayable(claim, policy).lines!;
    expect(lines.every((l) => l.covered)).toBe(true);
    expect(lines.map((l) => l.deductible)).toEqual([0, 0]);
    expect(lines[0].patientResponsibility).toBeCloseTo(48 * 0.2, 2);
    expect(lines[1].patientResponsibility).toBeCloseTo(135 * 0.2, 2);
  });

  it('are not covered when the plan has no Dental benefit', () => {
    const base = healthClaim();
    const claim = { ...base, details: { ...(base.details as Extract<typeof base.details, { kind: 'HEALTH' }>), lines: [{ procedureCode: 'D1110', diagnosisCode: 'Z01.20', units: 1, billedAmount: 95 }] } };
    expect(calculatePayable(claim, healthPolicy).lines![0].covered).toBe(false);
  });
});
