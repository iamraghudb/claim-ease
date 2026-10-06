import { DEFAULT_RULES_CONFIG } from './config';
import { DECISION_STATUSES } from './statusMachine';
import type { Claim, ClaimStatus, ClaimType, Complexity, HealthServiceType, RulesConfig } from './types';

const HOUR_MS = 3_600_000;

export const SLA_DISCLAIMER =
  'Timeframes vary by insurance type, state regulation, and policy terms. The windows shown here (including the ERISA-style health examples) are illustrative targets, not legal deadlines.';

export interface SlaInput {
  claimType: ClaimType;
  createdAt: string;
  complexity: Complexity;
  healthServiceType?: HealthServiceType;
}

/** Number of hours in the SLA window for a claim. */
export function slaWindowHours(input: Omit<SlaInput, 'createdAt'>, config: RulesConfig = DEFAULT_RULES_CONFIG): number {
  if (input.claimType === 'HEALTH') return config.healthSlaHours[input.healthServiceType ?? 'POST_SERVICE'];
  return config.slaTargetsDays[input.claimType][input.complexity] * 24;
}

export function computeSlaDueDate(input: SlaInput, config: RulesConfig = DEFAULT_RULES_CONFIG): string {
  const start = new Date(input.createdAt).getTime();
  return new Date(start + slaWindowHours(input, config) * HOUR_MS).toISOString();
}

export type SlaState = 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'PAUSED' | 'MET' | 'MISSED';

export interface SlaStatus {
  state: SlaState;
  remainingMs: number;
  label: string;
  /** Fraction of the window elapsed, 0-1 (clamped). */
  elapsedPct: number;
}

export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / (24 * HOUR_MS));
  const h = Math.floor((abs % (24 * HOUR_MS)) / HOUR_MS);
  const m = Math.floor((abs % HOUR_MS) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Statuses after which the decision SLA no longer runs. */
const DECIDED: ClaimStatus[] = [...DECISION_STATUSES, 'PAYMENT_PENDING', 'PAID', 'CLOSED'];

export function getSlaStatus(
  claim: Pick<Claim, 'createdAt' | 'slaDueDate' | 'status' | 'decidedAt' | 'slaStartedAt'>,
  now: Date = new Date(),
  config: RulesConfig = DEFAULT_RULES_CONFIG,
): SlaStatus {
  const start = new Date(claim.slaStartedAt ?? claim.createdAt).getTime();
  const due = new Date(claim.slaDueDate).getTime();
  const window = Math.max(1, due - start);

  if (DECIDED.includes(claim.status)) {
    const decided = claim.decidedAt ? new Date(claim.decidedAt).getTime() : now.getTime();
    const met = decided <= due;
    return {
      state: met ? 'MET' : 'MISSED',
      remainingMs: due - decided,
      label: met ? `Decided ${formatDuration(due - decided)} early` : `Decided ${formatDuration(decided - due)} late`,
      elapsedPct: Math.min(1, (decided - start) / window),
    };
  }

  const remainingMs = due - now.getTime();
  const elapsedPct = Math.min(1, Math.max(0, (now.getTime() - start) / window));
  if (claim.status === 'INFORMATION_REQUIRED')
    return { state: 'PAUSED', remainingMs, label: `Paused · awaiting info (${formatDuration(remainingMs)} left)`, elapsedPct };
  if (remainingMs < 0) return { state: 'OVERDUE', remainingMs, label: `Overdue by ${formatDuration(remainingMs)}`, elapsedPct };
  if (remainingMs / window <= config.atRiskThresholdPct)
    return { state: 'AT_RISK', remainingMs, label: `${formatDuration(remainingMs)} left`, elapsedPct };
  return { state: 'ON_TRACK', remainingMs, label: `${formatDuration(remainingMs)} left`, elapsedPct };
}
