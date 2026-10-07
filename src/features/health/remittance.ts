// The remittance (835-style) figures behind the health claim screen, and what Ease may be told about them.
// Pure functions: the screen and the unit tests share the exact same arithmetic.

import { STATUS_LABELS } from '../../domain/statusMachine';
import type { Claim, HealthLineResult, PayableBreakdown } from '../../domain/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Remittance {
  lines: HealthLineResult[];
  totals: { billed: number; allowed: number; planPaid: number; patient: number };
  denied: boolean;
}

/**
 * Remittance figures: use the decision if one exists, and scale the plan-paid lines if the examiner overrode the total.
 * Shared by the screen and by Ease, so what Ease explains is always what the person is looking at.
 */
export function remittance(claim: Pick<Claim, 'decision'>, p: PayableBreakdown): Remittance {
  const approved = claim.decision?.approvedAmount;
  const denied = claim.decision?.outcome === 'DENIED';
  const scale = approved !== undefined && p.payable > 0 ? approved / p.payable : 1;
  const lines = (p.lines ?? []).map((l) => {
    const planPaid = denied ? 0 : round2(l.planPaid * scale);
    return { ...l, planPaid, patientResponsibility: denied ? l.billed : round2(l.allowed - planPaid + (l.covered ? 0 : l.billed)) };
  });
  return {
    lines,
    totals: {
      billed: lines.reduce((s, l) => s + l.billed, 0),
      allowed: lines.reduce((s, l) => s + l.allowed, 0),
      planPaid: lines.reduce((s, l) => s + l.planPaid, 0),
      patient: lines.reduce((s, l) => s + l.patientResponsibility, 0),
    },
    denied,
  };
}

export interface CostContext {
  billed: number;
  allowed: number;
  deductible: number;
  copay: number;
  coinsurance: number;
  planPaid: number;
  patientResponsibility: number;
  providerWriteOff: number;
}

/**
 * The numbers Ease is given to explain "what I owe": amounts only, no names, codes or identifiers.
 * When the claim was denied the plan paid nothing, so the plan-side figures (allowed amount, deductible, copay,
 * coinsurance, write-off) are sent as 0: they were only projections and would not add up to what the person owes.
 */
export function costContext(
  r: Pick<Remittance, 'totals' | 'denied'>,
  p: Pick<PayableBreakdown, 'deductibleApplied' | 'copayApplied' | 'coinsuranceApplied' | 'contractualAdjustment'>,
): CostContext {
  const plan = (n: number) => (r.denied ? 0 : round2(n));
  return {
    billed: round2(r.totals.billed),
    allowed: plan(r.totals.allowed),
    deductible: plan(p.deductibleApplied),
    copay: plan(p.copayApplied),
    coinsurance: plan(p.coinsuranceApplied),
    planPaid: round2(r.totals.planPaid),
    patientResponsibility: round2(r.totals.patient),
    providerWriteOff: plan(p.contractualAdjustment),
  };
}

/** What the health claim screen tells Ease it is showing. Amounts and codes only: no patient, member or provider details. */
export function healthPageData(claim: Claim, r: Remittance, p: PayableBreakdown, viewing: string) {
  return {
    claimNumber: claim.claimNumber,
    status: STATUS_LABELS[claim.status],
    viewing,
    decision: claim.decision ? { outcome: claim.decision.outcome, approvedAmount: claim.decision.approvedAmount } : undefined,
    remittance: costContext(r, p),
    serviceLines: r.lines.map((l) => ({
      procedureCode: l.procedureCode,
      description: l.description,
      billed: l.billed,
      allowed: l.allowed,
      deductible: l.deductible,
      copay: l.copay,
      coinsurance: l.coinsurance,
      planPaid: l.planPaid,
      patientResponsibility: l.patientResponsibility,
    })),
  };
}
