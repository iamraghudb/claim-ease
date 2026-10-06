import { getRequirements, type ClaimLike, type Requirement } from './requirements';

export interface ReadinessResult {
  score: number; // 0-100
  items: Requirement[];
  missing: Requirement[];
  estimated: Requirement[];
  label: 'Needs work' | 'Almost there' | 'Ready';
}

const WEIGHT_REQUIRED = 3;
const WEIGHT_RECOMMENDED = 1;
/** An estimated/unsure value earns partial credit: it is honest, but still needs confirmation. */
const ESTIMATED_CREDIT = 0.5;

export function computeReadiness(claim: ClaimLike): ReadinessResult {
  const items = getRequirements(claim);
  let total = 0;
  let earned = 0;
  for (const r of items) {
    const w = r.required ? WEIGHT_REQUIRED : WEIGHT_RECOMMENDED;
    total += w;
    if (r.satisfied) earned += r.estimated ? w * ESTIMATED_CREDIT : w;
  }
  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  const missing = items.filter((r) => !r.satisfied);
  const estimated = items.filter((r) => r.estimated);
  const label = score >= 90 ? 'Ready' : score >= 60 ? 'Almost there' : 'Needs work';
  return { score, items, missing, estimated, label };
}
