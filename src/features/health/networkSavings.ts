// Network savings: how much of what a provider billed is taken off because the provider is in the plan's network.
// The "network rate" is the fee-schedule amount the rules engine already uses as the allowed amount, so this is
// presentation of existing arithmetic, not a second set of numbers. Pure functions: no React, no I/O.

import type { Claim, HealthLineResult, RulesResult } from '../../domain/types';
import type { Remittance } from './remittance';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SavingsLine {
  procedureCode: string;
  description: string;
  billed: number;
  networkRate: number;
  saved: number;
  /** Share of the billed amount that the network rate removes, 0 to 100. */
  percent: number;
}

export interface NetworkSavings {
  /** Billed amount on the lines the plan recognises (not-covered lines have no network rate). */
  billed: number;
  networkRate: number;
  saved: number;
  percent: number;
  /** Lines where the network rate is below the billed amount, biggest saving first. */
  lines: SavingsLine[];
  /** False when the claim was denied: the network rate is then not applied to what the patient owes. */
  applies: boolean;
}

const EMPTY: NetworkSavings = { billed: 0, networkRate: 0, saved: 0, percent: 0, lines: [], applies: false };

const percentOf = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

function fromLines(lines: readonly HealthLineResult[], denied: boolean): NetworkSavings {
  const recognised = lines.filter((l) => l.covered);
  if (!recognised.length) return { ...EMPTY, applies: !denied };
  const billed = round2(recognised.reduce((s, l) => s + l.billed, 0));
  const networkRate = round2(recognised.reduce((s, l) => s + l.allowed, 0));
  const detail = recognised
    .map((l) => ({
      procedureCode: l.procedureCode,
      description: l.description,
      billed: l.billed,
      networkRate: l.allowed,
      saved: round2(l.billed - l.allowed),
      percent: percentOf(l.billed - l.allowed, l.billed),
    }))
    .filter((l) => l.saved > 0)
    .sort((a, b) => b.saved - a.saved);
  if (denied) return { billed, networkRate, saved: 0, percent: 0, lines: [], applies: false };
  const saved = round2(billed - networkRate);
  return { billed, networkRate, saved, percent: percentOf(saved, billed), lines: detail, applies: true };
}

/** Savings for one health claim, from the same remittance the claim screen shows. */
export function networkSavings(r: Pick<Remittance, 'lines' | 'denied'>): NetworkSavings {
  return fromLines(r.lines, r.denied);
}

export interface PortfolioSavings {
  /** Health claims that were counted (denied claims and claims without service lines are not). */
  claims: number;
  billed: number;
  saved: number;
  percent: number;
}

/** Savings across every health claim, for the operations dashboard. */
export function portfolioSavings(claims: readonly Claim[], rules: ReadonlyMap<string, RulesResult>): PortfolioSavings {
  let counted = 0;
  let billed = 0;
  let saved = 0;
  for (const c of claims) {
    if (c.details.kind !== 'HEALTH') continue;
    const lines = rules.get(c.claimNumber)?.payable.lines;
    if (!lines?.length) continue;
    const s = fromLines(lines, c.decision?.outcome === 'DENIED');
    if (!s.applies || s.billed === 0) continue;
    counted += 1;
    billed += s.billed;
    saved += s.saved;
  }
  return { claims: counted, billed: round2(billed), saved: round2(saved), percent: percentOf(saved, billed) };
}
