// What a doctor's office cares about: money in the pipe, what is stuck, and who they bill for again and again.
// Pure functions over the claims the provider can see. No React, no I/O.

import { PROCEDURES } from '../../domain/catalog';
import type { Claim, ClaimStatus, HealthDetails, HealthServiceLine } from '../../domain/types';

const health = (c: Claim): HealthDetails | undefined => (c.details.kind === 'HEALTH' ? c.details : undefined);

export type Stage = 'IN_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'PAID' | 'DENIED';

const STAGE_OF: Record<ClaimStatus, Stage> = {
  REPORTED: 'IN_REVIEW',
  REGISTERED: 'IN_REVIEW',
  UNDER_REVIEW: 'IN_REVIEW',
  INVESTIGATION: 'IN_REVIEW',
  ADJUDICATION: 'IN_REVIEW',
  APPEALED: 'IN_REVIEW',
  REOPENED: 'IN_REVIEW',
  INFORMATION_REQUIRED: 'NEEDS_INFO',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'APPROVED',
  PAYMENT_PENDING: 'APPROVED',
  PAID: 'PAID',
  CLOSED: 'PAID',
  DENIED: 'DENIED',
};

export const STAGE_LABELS: Record<Stage, string> = {
  IN_REVIEW: 'In review',
  NEEDS_INFO: 'Needs your input',
  APPROVED: 'Approved, payment due',
  PAID: 'Paid',
  DENIED: 'Denied',
};

export const stageOf = (c: Claim): Stage => STAGE_OF[c.status];

export interface PracticeStats {
  claims: number;
  /** Everything billed. */
  billed: number;
  /** Approved and not yet paid out. */
  awaiting: number;
  /** Money that has arrived. */
  paid: number;
  /** Claims where the insurer is waiting on the practice. */
  needsInfo: Claim[];
  /** Denied claims the practice may want to appeal or fix. */
  denied: Claim[];
  byStage: { stage: Stage; label: string; count: number; amount: number }[];
}

const STAGES: Stage[] = ['IN_REVIEW', 'NEEDS_INFO', 'APPROVED', 'PAID', 'DENIED'];

export function practiceStats(claims: Claim[]): PracticeStats {
  const byStage = STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage], count: 0, amount: 0 }));
  let billed = 0;
  let awaiting = 0;
  let paid = 0;
  for (const c of claims) {
    const slot = byStage.find((s) => s.stage === stageOf(c))!;
    slot.count += 1;
    slot.amount += c.estimatedAmount;
    billed += c.estimatedAmount;
    const stage = slot.stage;
    if (stage === 'PAID') paid += c.payment?.amount ?? c.decision?.approvedAmount ?? 0;
    else if (stage === 'APPROVED') awaiting += c.decision?.approvedAmount ?? 0;
  }
  return {
    claims: claims.length,
    billed,
    awaiting,
    paid,
    needsInfo: claims.filter((c) => c.status === 'INFORMATION_REQUIRED'),
    denied: claims.filter((c) => c.status === 'DENIED'),
    byStage,
  };
}

export interface RecentPatient {
  patientName: string;
  patientDob: string;
  memberId: string;
  policyNumber: string;
  claims: number;
  lastVisit: string;
}

/** The patients this practice has billed for, most recent first. One entry per member ID. */
export function recentPatients(claims: Claim[], limit = 6): RecentPatient[] {
  const byMember = new Map<string, RecentPatient>();
  for (const c of [...claims].sort((a, b) => b.dateOfLoss.localeCompare(a.dateOfLoss))) {
    const h = health(c);
    if (!h || !h.memberId) continue;
    const seen = byMember.get(h.memberId);
    if (seen) seen.claims += 1;
    else byMember.set(h.memberId, { patientName: h.patientName, patientDob: h.patientDob, memberId: h.memberId, policyNumber: c.policyNumber, claims: 1, lastVisit: c.dateOfLoss });
  }
  return [...byMember.values()].slice(0, limit);
}

export interface VisitTemplate {
  id: string;
  label: string;
  hint: string;
  serviceType: HealthDetails['serviceType'];
  placeOfService: string;
  lines: { procedureCode: string; diagnosisCode: string; units: number }[];
}

/** One-tap starting points for the visits a practice sees most. The fee comes from the fee schedule, and can be edited. */
export const VISIT_TEMPLATES: VisitTemplate[] = [
  { id: 'sick', label: 'Sick visit + labs', hint: '99214, CBC', serviceType: 'POST_SERVICE', placeOfService: '11', lines: [{ procedureCode: '99214', diagnosisCode: 'J06.9', units: 1 }, { procedureCode: '85025', diagnosisCode: 'J06.9', units: 1 }] },
  { id: 'urgent', label: 'Urgent care + X-ray', hint: 'S9083, chest X-ray', serviceType: 'URGENT', placeOfService: '20', lines: [{ procedureCode: 'S9083', diagnosisCode: 'J06.9', units: 1 }, { procedureCode: '71046', diagnosisCode: 'R07.9', units: 1 }] },
  { id: 'annual', label: 'Annual exam + bloodwork', hint: '99213, CMP, CBC', serviceType: 'POST_SERVICE', placeOfService: '11', lines: [{ procedureCode: '99213', diagnosisCode: 'Z00.00', units: 1 }, { procedureCode: '80053', diagnosisCode: 'Z00.00', units: 1 }, { procedureCode: '85025', diagnosisCode: 'Z00.00', units: 1 }] },
  { id: 'pt', label: 'Physical therapy', hint: '97110 x 4', serviceType: 'POST_SERVICE', placeOfService: '11', lines: [{ procedureCode: '97110', diagnosisCode: 'M25.561', units: 4 }] },
  { id: 'knee', label: 'Knee MRI + consult', hint: '99213, 73721', serviceType: 'POST_SERVICE', placeOfService: '22', lines: [{ procedureCode: '99213', diagnosisCode: 'M25.561', units: 1 }, { procedureCode: '73721', diagnosisCode: 'S83.241A', units: 1 }] },
];

/** The service lines a template fills in. The billed amount is the fee schedule's price times the units. */
export function templateLines(t: VisitTemplate): HealthServiceLine[] {
  return t.lines.map((l) => ({ ...l, billedAmount: (PROCEDURES.find((p) => p.code === l.procedureCode)?.allowed ?? 0) * l.units }));
}
