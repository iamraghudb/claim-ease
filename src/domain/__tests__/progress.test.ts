import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../services/seed';
import { claimProgressPercent } from '../progress';
import type { Claim, ClaimStatus } from '../types';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const base = seed.claims[0];
const at = (status: ClaimStatus, overrides: Partial<Claim> = {}) => ({ ...base, status, ...overrides });

describe('claimProgressPercent', () => {
  it('starts low and ends at 100 when closed', () => {
    expect(claimProgressPercent(at('REPORTED', { auditTrail: [] }))).toBeLessThan(15);
    expect(claimProgressPercent(at('CLOSED'))).toBe(100);
  });

  it('never goes backwards as a claim moves through the lifecycle', () => {
    const order: ClaimStatus[] = ['REPORTED', 'REGISTERED', 'UNDER_REVIEW', 'ADJUDICATION', 'APPROVED', 'PAID', 'CLOSED'];
    const pct = order.map((s) => claimProgressPercent(at(s, { auditTrail: [] })));
    expect(pct).toEqual([...pct].sort((a, b) => a - b));
  });

  it('stays within 0-100 for every status', () => {
    for (const s of ['REPORTED', 'REGISTERED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED', 'INVESTIGATION', 'ADJUDICATION', 'APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'APPEALED', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'REOPENED'] as ClaimStatus[]) {
      const p = claimProgressPercent(at(s));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it('does not count skipped stages against a denied claim (no payment stage)', () => {
    expect(claimProgressPercent(at('DENIED'))).toBeGreaterThan(claimProgressPercent(at('UNDER_REVIEW')));
  });
});
