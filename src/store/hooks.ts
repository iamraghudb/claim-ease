import { useMemo } from 'react';
import { evaluateClaim } from '../domain/rulesEngine';
import type { Claim, Policy, RulesResult } from '../domain/types';
import { useAppStore } from './appStore';

export function useClaim(claimNumber: string | undefined): Claim | undefined {
  return useAppStore((s) => s.claims.find((c) => c.claimNumber === claimNumber));
}

export function usePolicy(policyNumber: string | undefined): Policy | undefined {
  return useAppStore((s) => s.policies.find((p) => p.policyNumber === policyNumber));
}

/**
 * Rules results are computed client-side from the pure rules engine for the
 * demo. With a real backend, fetch them from an /evaluate endpoint instead.
 */
export function useRules(claim: Claim | undefined): RulesResult | undefined {
  const policies = useAppStore((s) => s.policies);
  const claims = useAppStore((s) => s.claims);
  const config = useAppStore((s) => s.config);
  return useMemo(() => {
    if (!claim) return undefined;
    const policy = policies.find((p) => p.policyNumber === claim.policyNumber);
    return evaluateClaim(claim, policy, { otherClaims: claims, config });
  }, [claim, policies, claims, config]);
}

export function useAllRules(): Map<string, RulesResult> {
  const policies = useAppStore((s) => s.policies);
  const claims = useAppStore((s) => s.claims);
  const config = useAppStore((s) => s.config);
  return useMemo(() => {
    const m = new Map<string, RulesResult>();
    for (const c of claims)
      m.set(c.claimNumber, evaluateClaim(c, policies.find((p) => p.policyNumber === c.policyNumber), { otherClaims: claims, config }));
    return m;
  }, [claims, policies, config]);
}
