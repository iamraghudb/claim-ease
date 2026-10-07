import {
  AUTO_INCIDENT_TYPES,
  findProcedure,
  PROCEDURE_CATEGORY_TO_COVERAGE,
  propertyCoverageFor,
} from './catalog';
import { DEFAULT_RULES_CONFIG } from './config';
import { getRequirements, missingRequiredDocuments, missingRequiredFields, type ClaimLike } from './requirements';
import type {
  CheckResult,
  Claim,
  Complexity,
  HealthLineResult,
  PayableBreakdown,
  Policy,
  Priority,
  ReviewTrigger,
  RulesConfig,
  RulesResult,
} from './types';

// Pure, deterministic adjudication checks. No I/O, no Date.now() unless passed
// in, so every function is unit-testable and can run server-side unchanged.
//
// Guiding principle: more uncertainty → more investigation and human review.

const DAY_MS = 86_400_000;

const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type EvaluableClaim = ClaimLike &
  Partial<Pick<Claim, 'claimNumber' | 'policyNumber' | 'tags' | 'expertInputs' | 'createdAt' | 'claimantName'>>;

export interface RulesContext {
  /** Other claims on file, used for duplicate / frequency fraud indicators. */
  otherClaims?: Pick<Claim, 'claimNumber' | 'policyNumber' | 'dateOfLoss' | 'createdAt' | 'status'>[];
  config?: RulesConfig;
  now?: Date;
}

// ---------- 1. Policy active on date of loss ----------

export function checkPolicyActive(policy: Policy | undefined, dateOfLoss: string): CheckResult {
  const base = { id: 'POLICY_ACTIVE' as const, label: 'Policy active on date of loss / service' };
  if (!policy) return { ...base, status: 'FAIL', explanation: 'No matching policy was found.' };
  if (!dateOfLoss) return { ...base, status: 'WARN', explanation: 'Date of loss / service is missing.' };
  const d = toDate(dateOfLoss);
  const inPeriod = d >= toDate(policy.effectiveDate) && d <= toDate(policy.expiryDate);
  if (!inPeriod)
    return {
      ...base,
      status: 'FAIL',
      explanation: `${dateOfLoss} is outside the coverage period ${policy.effectiveDate} – ${policy.expiryDate}.`,
    };
  if (policy.status !== 'ACTIVE')
    return { ...base, status: 'FAIL', explanation: `Policy status is ${policy.status}.` };
  return {
    ...base,
    status: 'PASS',
    explanation: `Policy ${policy.policyNumber} is ACTIVE and ${dateOfLoss} falls within ${policy.effectiveDate} – ${policy.expiryDate}.`,
  };
}

// ---------- 2. Coverage & exclusions ----------

/** Returns the named coverage that responds to this claim, or null if none applies. */
export function resolveCoverageName(claim: ClaimLike, policy: Policy): string | null {
  const d = claim.details;
  if (d.kind === 'AUTO') return AUTO_INCIDENT_TYPES.find((t) => t.value === d.incidentType)?.coverage ?? null;
  if (d.kind === 'PROPERTY') return propertyCoverageFor(d.damageType, policy.type);
  return null; // health is evaluated per service line
}

export function checkCoverage(claim: ClaimLike, policy: Policy | undefined): CheckResult {
  const base = { id: 'COVERAGE' as const, label: 'Event / service covered and not excluded' };
  if (!policy) return { ...base, status: 'FAIL', explanation: 'Cannot evaluate coverage without a policy.' };
  const exclusions = policy.exclusions.map((e) => e.toUpperCase());
  const d = claim.details;

  if (d.kind === 'HEALTH') {
    const problems: string[] = [];
    const unknown: string[] = [];
    for (const line of d.lines) {
      const proc = findProcedure(line.procedureCode);
      if (!proc) {
        unknown.push(line.procedureCode || '(blank)');
        continue;
      }
      const cov = PROCEDURE_CATEGORY_TO_COVERAGE[proc.category];
      if (exclusions.includes(cov.toUpperCase()) || !policy.coverages.some((c) => c.name === cov))
        problems.push(`${proc.code} (${cov})`);
    }
    if (problems.length && problems.length === d.lines.length)
      return { ...base, status: 'FAIL', explanation: `Not covered / excluded: ${problems.join(', ')}.` };
    if (problems.length)
      return {
        ...base,
        status: 'WARN',
        explanation: `Some lines are not covered: ${problems.join(', ')}. Remaining lines are covered.`,
      };
    if (unknown.length)
      return {
        ...base,
        status: 'WARN',
        explanation: `Unrecognized procedure code(s): ${unknown.join(', ')}. Coverage needs manual verification.`,
      };
    return { ...base, status: 'PASS', explanation: 'All billed services map to covered benefits.' };
  }

  const peril = d.kind === 'AUTO' ? d.incidentType : d.damageType;
  if (exclusions.includes(peril))
    return { ...base, status: 'FAIL', explanation: `${peril} is listed as an exclusion on this policy.` };
  const coverageName = resolveCoverageName(claim, policy);
  const coverage = policy.coverages.find((c) => c.name === coverageName);
  if (!coverage)
    return {
      ...base,
      status: 'WARN',
      explanation: `Loss maps to "${coverageName}", which is not on this policy. Coverage needs manual review.`,
    };
  if (d.kind === 'PROPERTY' && d.damageType === 'WATER' && /gradual|slow|months|weeks/i.test(claim.incidentDescription))
    return {
      ...base,
      status: 'WARN',
      explanation: 'Description suggests gradual leakage, which many policies exclude. Verify sudden vs. gradual.',
    };
  return {
    ...base,
    status: 'PASS',
    explanation: `Covered under ${coverage.name} (limit ${formatUSD(coverage.limit)}). No exclusions apply.`,
  };
}

// ---------- 3. Eligibility ----------

export function checkEligibility(claim: ClaimLike & { claimantName?: string }, policy: Policy | undefined): CheckResult {
  const base = { id: 'ELIGIBILITY' as const, label: 'Claimant / member eligible' };
  if (!policy) return { ...base, status: 'FAIL', explanation: 'No policy on file.' };
  const d = claim.details;
  if (d.kind === 'HEALTH') {
    const member = policy.members?.find((m) => m.memberId === d.memberId);
    if (!member) return { ...base, status: 'FAIL', explanation: `Member ID ${d.memberId || '(blank)'} is not on this plan.` };
    if (!member.eligible) return { ...base, status: 'FAIL', explanation: `${member.name} is not eligible on the date of service.` };
    if (d.patientDob && member.dob !== d.patientDob)
      return { ...base, status: 'WARN', explanation: `Date of birth does not match member record for ${member.name}.` };
    return { ...base, status: 'PASS', explanation: `${member.name} (${member.relationship.toLowerCase()}) is an eligible member.` };
  }
  if (d.kind === 'AUTO') {
    const v = d.vehicle;
    const listed = policy.vehicles?.some(
      (pv) => (v.vin && pv.vin === v.vin) || (pv.make.toLowerCase() === v.make.toLowerCase() && pv.model.toLowerCase() === v.model.toLowerCase()),
    );
    if (!listed)
      return { ...base, status: 'WARN', explanation: `${v.year ?? ''} ${v.make} ${v.model} is not a listed vehicle on the policy.`.trim() };
    return { ...base, status: 'PASS', explanation: 'Vehicle is listed on the policy and the named insured is filing.' };
  }
  if (policy.propertyAddress && d.propertyAddress && !sameAddress(policy.propertyAddress, d.propertyAddress))
    return { ...base, status: 'WARN', explanation: 'Loss address differs from the insured property address.' };
  return { ...base, status: 'PASS', explanation: 'Loss is at the insured location and filed by the named insured.' };
}

function sameAddress(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a).startsWith(norm(b).slice(0, 10)) || norm(b).startsWith(norm(a).slice(0, 10));
}

// ---------- 4. Required documents & data ----------

export function checkRequiredDocuments(claim: ClaimLike): CheckResult {
  const base = { id: 'REQUIRED_DOCS' as const, label: 'Required documents and data present' };
  const docs = missingRequiredDocuments(claim);
  const fields = missingRequiredFields(claim);
  const estimated = getRequirements(claim).filter((r) => r.estimated);
  if (docs.length || fields.length) {
    const parts = [...fields.map((f) => f.label), ...docs.map((d) => d.label)];
    return { ...base, status: 'FAIL', explanation: `Missing: ${parts.join(', ')}.` };
  }
  if (estimated.length)
    return {
      ...base,
      status: 'WARN',
      explanation: `All items present, but marked estimated/unsure: ${estimated.map((e) => e.label).join(', ')}.`,
    };
  return { ...base, status: 'PASS', explanation: 'All required fields and documents for this claim type are on file.' };
}

// ---------- 5 & 6. Cost sharing and payable amount ----------

/**
 * Property & casualty: payable = min(max(amount − deductible, 0), coverage limit).
 * Health: per-line allowed amounts from the fee schedule, then remaining deductible,
 * copay (office/urgent visits) or coinsurance, capped at the remaining out-of-pocket max.
 */
export function calculatePayable(claim: ClaimLike, policy: Policy | undefined, amountOverride?: number): PayableBreakdown {
  const claimed = round2(amountOverride ?? claim.estimatedAmount ?? 0);
  const empty: PayableBreakdown = {
    claimed,
    allowed: 0,
    coverageLimit: null,
    deductibleApplied: 0,
    copayApplied: 0,
    coinsuranceApplied: 0,
    limitReduction: 0,
    outOfPocketCapApplied: 0,
    contractualAdjustment: 0,
    payable: 0,
    claimantResponsibility: claimed,
    notes: [],
  };
  if (!policy) return { ...empty, notes: ['No policy — nothing payable.'] };

  if (claim.details.kind === 'HEALTH') return calculateHealthPayable(claim, policy);

  const coverageName = resolveCoverageName(claim, policy);
  const coverage = policy.coverages.find((c) => c.name === coverageName);
  const excluded = policy.exclusions
    .map((e) => e.toUpperCase())
    .includes(claim.details.kind === 'AUTO' ? claim.details.incidentType : claim.details.damageType);
  if (!coverage || excluded)
    return { ...empty, notes: [excluded ? 'Loss is excluded — nothing payable.' : `No ${coverageName} coverage — nothing payable.`] };

  const deductibleApplied = Math.min(policy.deductible, claimed);
  const afterDeductible = claimed - deductibleApplied;
  const payable = Math.min(afterDeductible, coverage.limit);
  const limitReduction = afterDeductible - payable;
  const notes = [`Deductible of ${formatUSD(policy.deductible)} applied.`];
  if (limitReduction > 0) notes.push(`Capped at ${coverage.name} limit of ${formatUSD(coverage.limit)}.`);
  return {
    ...empty,
    allowed: claimed,
    coverageLimit: coverage.limit,
    deductibleApplied: round2(deductibleApplied),
    limitReduction: round2(limitReduction),
    payable: round2(payable),
    claimantResponsibility: round2(claimed - payable),
    notes,
  };
}

function calculateHealthPayable(claim: ClaimLike, policy: Policy): PayableBreakdown {
  const d = claim.details;
  if (d.kind !== 'HEALTH') throw new Error('Health claim expected');
  const benefits = policy.health ?? { copay: 0, coinsurance: 0, outOfPocketMax: Infinity, deductibleMet: 0, outOfPocketMet: 0 };
  const exclusions = policy.exclusions.map((e) => e.toUpperCase());

  let deductibleRemaining = Math.max(0, policy.deductible - benefits.deductibleMet);
  let copayUsed = false;
  const lines: HealthLineResult[] = d.lines.map((line) => {
    const proc = findProcedure(line.procedureCode);
    const billed = round2(line.billedAmount);
    const coverageName = proc ? PROCEDURE_CATEGORY_TO_COVERAGE[proc.category] : undefined;
    const covered =
      !!proc && !!coverageName && !exclusions.includes(coverageName.toUpperCase()) && policy.coverages.some((c) => c.name === coverageName);
    if (!covered) {
      return {
        procedureCode: line.procedureCode,
        description: proc?.description ?? 'Unknown procedure',
        billed,
        allowed: 0,
        covered: false,
        deductible: 0,
        copay: 0,
        coinsurance: 0,
        planPaid: 0,
        patientResponsibility: billed,
        remarkCode: proc ? 'CO-96 Non-covered charge' : 'CO-16 Missing/invalid code',
      };
    }
    const allowed = round2(Math.min(billed, proc.allowed * Math.max(1, line.units)));
    let copay = 0;
    let deductible = 0;
    let coinsurance = 0;
    if (proc.category === 'OFFICE_VISIT' || proc.category === 'URGENT_CARE') {
      // Copay applies once per claim for visit codes; not subject to deductible.
      copay = copayUsed ? 0 : Math.min(benefits.copay, allowed);
      copayUsed = true;
    } else if (proc.category === 'DENTAL' || proc.category === 'VISION') {
      // Dental and vision are separate benefits: no medical deductible, only the coinsurance share.
      coinsurance = round2(allowed * benefits.coinsurance);
    } else {
      deductible = Math.min(deductibleRemaining, allowed);
      deductibleRemaining -= deductible;
      coinsurance = round2((allowed - deductible) * benefits.coinsurance);
    }
    const patient = round2(copay + deductible + coinsurance);
    return {
      procedureCode: line.procedureCode,
      description: proc.description,
      billed,
      allowed,
      covered: true,
      deductible: round2(deductible),
      copay: round2(copay),
      coinsurance,
      planPaid: round2(allowed - patient),
      patientResponsibility: patient,
      remarkCode: billed > allowed ? 'CO-45 Exceeds fee schedule' : undefined,
    };
  });

  // Cap member cost-share at the remaining out-of-pocket maximum.
  const oopRemaining = Math.max(0, benefits.outOfPocketMax - benefits.outOfPocketMet);
  const costShare = lines.filter((l) => l.covered).reduce((s, l) => s + l.patientResponsibility, 0);
  let outOfPocketCapApplied = 0;
  if (costShare > oopRemaining) {
    outOfPocketCapApplied = round2(costShare - oopRemaining);
    let reduce = outOfPocketCapApplied;
    for (const l of lines) {
      if (!l.covered || reduce <= 0) continue;
      const r = Math.min(l.patientResponsibility, reduce);
      l.patientResponsibility = round2(l.patientResponsibility - r);
      l.planPaid = round2(l.planPaid + r);
      reduce -= r;
    }
  }

  const sum = (f: (l: HealthLineResult) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const billed = sum((l) => l.billed);
  const allowed = sum((l) => l.allowed);
  const coveredBilled = sum((l) => (l.covered ? l.billed : 0));
  const notes: string[] = [];
  if (coveredBilled > allowed) notes.push(`Provider write-off of ${formatUSD(coveredBilled - allowed)} (billed above in-network allowed).`);
  if (lines.some((l) => !l.covered)) notes.push('One or more lines are not covered and are the patient’s responsibility.');
  if (outOfPocketCapApplied > 0) notes.push(`Out-of-pocket maximum reached; ${formatUSD(outOfPocketCapApplied)} shifted to plan.`);
  return {
    claimed: billed,
    allowed,
    coverageLimit: null,
    deductibleApplied: sum((l) => l.deductible),
    copayApplied: sum((l) => l.copay),
    coinsuranceApplied: sum((l) => l.coinsurance),
    limitReduction: 0,
    outOfPocketCapApplied,
    contractualAdjustment: round2(coveredBilled - allowed),
    payable: sum((l) => l.planPaid),
    claimantResponsibility: sum((l) => l.patientResponsibility),
    lines,
    notes,
  };
}

export function checkCostSharing(claim: ClaimLike, policy: Policy | undefined, payable: PayableBreakdown): CheckResult {
  const base = { id: 'COST_SHARING' as const, label: 'Deductible, limits and cost-sharing applied' };
  if (!policy) return { ...base, status: 'FAIL', explanation: 'No policy terms to apply.' };
  if (claim.details.kind === 'HEALTH') {
    return {
      ...base,
      status: 'PASS',
      explanation: `Deductible ${formatUSD(payable.deductibleApplied)}, copay ${formatUSD(payable.copayApplied)}, coinsurance ${formatUSD(
        payable.coinsuranceApplied,
      )} (${Math.round((policy.health?.coinsurance ?? 0) * 100)}%).`,
    };
  }
  if (payable.limitReduction > 0)
    return {
      ...base,
      status: 'WARN',
      explanation: `Deductible ${formatUSD(payable.deductibleApplied)} applied; loss exceeds the coverage limit by ${formatUSD(payable.limitReduction)}.`,
    };
  return {
    ...base,
    status: 'PASS',
    explanation: `Deductible ${formatUSD(payable.deductibleApplied)} applied; within coverage limit${
      payable.coverageLimit ? ` of ${formatUSD(payable.coverageLimit)}` : ''
    }.`,
  };
}

export function checkPayable(claim: ClaimLike, payable: PayableBreakdown): CheckResult {
  const base = { id: 'PAYABLE' as const, label: 'Payable amount and claimant responsibility' };
  const who = claim.details.kind === 'HEALTH' ? 'patient' : 'claimant';
  if (payable.payable <= 0)
    return { ...base, status: 'FAIL', explanation: `Nothing payable. ${payable.notes.join(' ')}`.trim() };
  return {
    ...base,
    status: 'PASS',
    explanation: `Payable ${formatUSD(payable.payable)}; ${who} responsibility ${formatUSD(payable.claimantResponsibility)}.`,
  };
}

// ---------- 7. Manual review triggers ----------

export function detectTriggers(
  claim: EvaluableClaim,
  policy: Policy | undefined,
  checks: CheckResult[],
  ctx: RulesContext = {},
): ReviewTrigger[] {
  const config = ctx.config ?? DEFAULT_RULES_CONFIG;
  const now = ctx.now ?? new Date();
  const triggers: ReviewTrigger[] = [];
  const amount = claim.estimatedAmount ?? 0;

  const threshold = config.highValueThreshold[claim.claimType];
  if (amount > threshold)
    triggers.push({
      code: 'HIGH_VALUE',
      label: 'High value',
      explanation: `${formatUSD(amount)} exceeds the ${formatUSD(threshold)} ${claim.claimType.toLowerCase()} threshold.`,
      weight: 20,
      delayReason: 'HIGH_VALUE_COMPLEXITY',
    });

  const missingDocs = missingRequiredDocuments(claim);
  const missingFields = missingRequiredFields(claim);
  if (missingFields.length)
    triggers.push({
      code: 'MISSING_DATA',
      label: 'Missing data',
      explanation: `Missing: ${missingFields.map((f) => f.label).join(', ')}.`,
      weight: 15,
      delayReason: 'MISSING_INFORMATION',
    });
  if (missingDocs.length)
    triggers.push({
      code: 'MISSING_DATA',
      label: 'Missing documents',
      explanation: `Missing: ${missingDocs.map((f) => f.label).join(', ')}.`,
      weight: 15,
      delayReason: 'MISSING_DOCUMENTS',
    });
  if (claim.estimatedFields.length) {
    const labels = new Map(getRequirements(claim).map((r) => [r.key, r.label]));
    triggers.push({
      code: 'ESTIMATED_DATA',
      label: 'Estimated / unsure values',
      explanation: `Filer marked ${claim.estimatedFields.length} value(s) as estimated: ${claim.estimatedFields.map((k) => labels.get(k) ?? k).join(', ')}.`,
      weight: 8 + 2 * Math.min(claim.estimatedFields.length, 5),
      delayReason: 'MISSING_INFORMATION',
    });
  }

  const d = claim.details;
  if (d.kind === 'AUTO') {
    if (d.otherParties.some((p) => p.atFault === 'UNKNOWN') || claim.estimatedFields.includes('liability'))
      triggers.push({
        code: 'UNCLEAR_LIABILITY',
        label: 'Unclear liability',
        explanation: 'Fault for at least one other party is "unknown". Liability must be investigated.',
        weight: 15,
        delayReason: 'UNCLEAR_LIABILITY',
      });
    if (d.injuries)
      triggers.push({
        code: 'INJURY',
        label: 'Bodily injury reported',
        explanation: 'Injury claims involve medical documentation and possible third-party liability.',
        weight: 10,
        delayReason: 'HIGH_VALUE_COMPLEXITY',
      });
  }

  const coverage = checks.find((c) => c.id === 'COVERAGE');
  const eligibility = checks.find((c) => c.id === 'ELIGIBILITY');
  if (coverage?.status === 'WARN' || eligibility?.status === 'WARN')
    triggers.push({
      code: 'COVERAGE_UNCERTAINTY',
      label: 'Coverage uncertainty',
      explanation: [coverage, eligibility].filter((c) => c?.status === 'WARN').map((c) => c!.explanation).join(' '),
      weight: 15,
      delayReason: 'COVERAGE_UNCERTAINTY',
    });

  const pendingExperts = (claim.expertInputs ?? []).filter((e) => e.status === 'PENDING');
  if (pendingExperts.length)
    triggers.push({
      code: 'THIRD_PARTY_PENDING',
      label: 'Third-party input pending',
      explanation: `Waiting on ${pendingExperts.map((e) => e.expertName).join(', ')}.`,
      weight: 10,
      delayReason: 'THIRD_PARTIES',
    });

  // Fraud indicators
  if (policy && claim.dateOfLoss) {
    const daysSinceStart = (toDate(claim.dateOfLoss).getTime() - toDate(policy.effectiveDate).getTime()) / DAY_MS;
    if (daysSinceStart >= 0 && daysSinceStart < config.newPolicyDays)
      triggers.push({
        code: 'FRAUD_NEW_POLICY',
        label: 'Loss shortly after policy start',
        explanation: `Loss occurred ${Math.floor(daysSinceStart)} day(s) after the policy took effect (threshold ${config.newPolicyDays}).`,
        weight: 20,
        delayReason: 'FRAUD_INVESTIGATION',
      });
  }
  const others = (ctx.otherClaims ?? []).filter(
    (c) => c.policyNumber === claim.policyNumber && c.claimNumber !== claim.claimNumber,
  );
  const dup = others.find((c) => c.dateOfLoss === claim.dateOfLoss);
  if (dup)
    triggers.push({
      code: 'FRAUD_DUPLICATE',
      label: 'Possible duplicate claim',
      explanation: `${dup.claimNumber} on the same policy has the same date of loss (${claim.dateOfLoss}).`,
      weight: 25,
      delayReason: 'FRAUD_INVESTIGATION',
    });
  const windowStart = now.getTime() - config.frequentClaimsWindowDays * DAY_MS;
  const recent = others.filter((c) => toDate(c.createdAt).getTime() >= windowStart);
  if (recent.length >= config.frequentClaimsCount)
    triggers.push({
      code: 'FRAUD_FREQUENT',
      label: 'Frequent claims',
      explanation: `${recent.length} other claims on this policy in the last ${config.frequentClaimsWindowDays} days (threshold ${config.frequentClaimsCount}).`,
      weight: 15,
      delayReason: 'FRAUD_INVESTIGATION',
    });

  const tags = (claim.tags ?? []).map((t) => t.toUpperCase());
  if (tags.includes('CATASTROPHE'))
    triggers.push({
      code: 'CATASTROPHE',
      label: 'Catastrophe event',
      explanation: 'Claim is tagged to a declared catastrophe event; expect higher volume and field inspections.',
      weight: 10,
      delayReason: 'CATASTROPHE_VOLUME',
    });
  if (tags.includes('LEGAL'))
    triggers.push({
      code: 'LEGAL',
      label: 'Attorney involvement',
      explanation: 'A legal representative is involved; communications must go through counsel.',
      weight: 15,
      delayReason: 'LEGAL_INVOLVEMENT',
    });

  return triggers;
}

export function scoreUncertainty(triggers: ReviewTrigger[], checks: CheckResult[]): number {
  const fromTriggers = triggers.reduce((s, t) => s + t.weight, 0);
  const fromChecks = checks.reduce((s, c) => s + (c.status === 'FAIL' ? 10 : c.status === 'WARN' ? 4 : 0), 0);
  return Math.min(100, fromTriggers + fromChecks);
}

export function classifyComplexity(uncertainty: number, triggers: ReviewTrigger[]): Complexity {
  const severe = triggers.some((t) => t.code === 'HIGH_VALUE' || t.code.startsWith('FRAUD') || t.code === 'LEGAL');
  if (severe || uncertainty >= 45) return 'HIGH';
  if (uncertainty >= 15) return 'MEDIUM';
  return 'LOW';
}

export function derivePriority(claim: EvaluableClaim, complexity: Complexity, fastTrack: boolean): Priority {
  if (claim.details.kind === 'HEALTH' && claim.details.serviceType === 'URGENT') return 'URGENT';
  if ((claim.tags ?? []).map((t) => t.toUpperCase()).includes('CATASTROPHE')) return 'URGENT';
  if (claim.details.kind === 'PROPERTY' && !claim.details.habitable) return 'URGENT';
  if (complexity === 'HIGH') return 'HIGH';
  if (fastTrack) return 'LOW';
  return 'NORMAL';
}

/** Runs every adjudication check and the manual-review triggers for a claim. */
export function evaluateClaim(claim: EvaluableClaim, policy: Policy | undefined, ctx: RulesContext = {}): RulesResult {
  const config = ctx.config ?? DEFAULT_RULES_CONFIG;
  const payable = calculatePayable(claim, policy);
  const checks: CheckResult[] = [
    checkPolicyActive(policy, claim.dateOfLoss),
    checkCoverage(claim, policy),
    checkEligibility(claim, policy),
    checkRequiredDocuments(claim),
    checkCostSharing(claim, policy, payable),
    checkPayable(claim, payable),
  ];
  const triggers = detectTriggers(claim, policy, checks, ctx);
  const uncertaintyScore = scoreUncertainty(triggers, checks);
  const complexity = classifyComplexity(uncertaintyScore, triggers);
  const anyFail = checks.some((c) => c.status === 'FAIL');
  const fastTrackEligible =
    triggers.length === 0 &&
    !anyFail &&
    checks.every((c) => c.status === 'PASS') &&
    (claim.estimatedAmount ?? 0) <= config.fastTrackMaxAmount[claim.claimType];
  const needsManualReview = !fastTrackEligible;

  checks.push({
    id: 'MANUAL_REVIEW',
    label: 'Needs manual review?',
    status: fastTrackEligible ? 'PASS' : anyFail || complexity === 'HIGH' ? 'FAIL' : 'WARN',
    explanation: fastTrackEligible
      ? 'Low uncertainty — fast-track eligible. Can be adjudicated without investigation.'
      : triggers.length
        ? `Human review required (${complexity.toLowerCase()} complexity): ${triggers.map((t) => t.label).join(', ')}.`
        : anyFail
          ? 'One or more checks failed; an adjuster must confirm the outcome.'
          : `Amount above the fast-track limit of ${formatUSD(config.fastTrackMaxAmount[claim.claimType])}.`,
  });

  return {
    checks,
    triggers,
    payable,
    uncertaintyScore,
    complexity,
    priority: derivePriority(claim, complexity, fastTrackEligible),
    needsManualReview,
    fastTrackEligible,
  };
}

export function formatUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}
