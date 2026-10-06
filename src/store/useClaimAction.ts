import { useCallback, useState } from 'react';
import type { Claim } from '../domain/types';
import { useAppStore } from './appStore';
import { toast } from './toastStore';

/**
 * Wraps a service mutation that returns an updated claim: tracks pending
 * state, updates the store and shows a success or error toast.
 */
export function useClaimAction() {
  const upsertClaim = useAppStore((s) => s.upsertClaim);
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, fn: () => Promise<Claim>, success?: string): Promise<Claim | undefined> => {
      setPending(key);
      try {
        const claim = await fn();
        upsertClaim(claim);
        if (success) toast.success(success);
        return claim;
      } catch (e) {
        toast.error('Action failed', e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [upsertClaim],
  );

  return { run, pending };
}
