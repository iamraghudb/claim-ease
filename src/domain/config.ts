import type { RulesConfig } from './types';

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  highValueThreshold: { AUTO: 15000, PROPERTY: 25000, HEALTH: 5000 },
  fastTrackMaxAmount: { AUTO: 5000, PROPERTY: 7500, HEALTH: 1500 },
  newPolicyDays: 30,
  frequentClaimsCount: 5,
  frequentClaimsWindowDays: 365,
  slaTargetsDays: {
    AUTO: { LOW: 7, MEDIUM: 15, HIGH: 30 },
    PROPERTY: { LOW: 10, MEDIUM: 20, HIGH: 40 },
  },
  healthSlaHours: { URGENT: 72, PRE_SERVICE: 15 * 24, POST_SERVICE: 30 * 24 },
  atRiskThresholdPct: 0.25,
};
