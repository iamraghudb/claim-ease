import { describe, expect, it } from 'vitest';
import {
  ALL_STATUSES,
  assertTransition,
  canTransition,
  getAllowedTransitions,
  getTimeline,
  InvalidTransitionError,
  TRANSITIONS,
} from '../statusMachine';
import type { AuditEntry, ClaimStatus } from '../types';

describe('status machine', () => {
  it('defines transitions for every status', () => {
    expect(ALL_STATUSES).toHaveLength(14);
    for (const s of ALL_STATUSES) expect(TRANSITIONS[s]).toBeDefined();
  });

  it('only targets known statuses', () => {
    for (const s of ALL_STATUSES) for (const t of TRANSITIONS[s]) expect(ALL_STATUSES).toContain(t.to);
  });

  it('follows the happy path', () => {
    const path: ClaimStatus[] = [
      'REPORTED', 'REGISTERED', 'UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED',
    ];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('supports the information-required loop', () => {
    expect(canTransition('UNDER_REVIEW', 'INFORMATION_REQUIRED')).toBe(true);
    expect(canTransition('INFORMATION_REQUIRED', 'UNDER_REVIEW')).toBe(true);
  });

  it('allows appeals only from DENIED or PARTIALLY_APPROVED', () => {
    const from = ALL_STATUSES.filter((s) => canTransition(s, 'APPEALED'));
    expect(from.sort()).toEqual(['DENIED', 'PARTIALLY_APPROVED']);
  });

  it('allows reopening only from CLOSED', () => {
    expect(ALL_STATUSES.filter((s) => canTransition(s, 'REOPENED'))).toEqual(['CLOSED']);
  });

  it('rejects skipping stages', () => {
    expect(canTransition('REGISTERED', 'APPROVED')).toBe(false);
    expect(canTransition('UNDER_REVIEW', 'PAID')).toBe(false);
    expect(canTransition('DENIED', 'PAYMENT_PENDING')).toBe(false);
    expect(canTransition('CLOSED', 'UNDER_REVIEW')).toBe(false);
  });

  it('enforces role permissions', () => {
    expect(canTransition('ADJUDICATION', 'APPROVED', 'ADJUSTER')).toBe(true);
    expect(canTransition('ADJUDICATION', 'APPROVED', 'CLAIMANT')).toBe(false);
    expect(canTransition('DENIED', 'APPEALED', 'CLAIMANT')).toBe(true);
    expect(canTransition('DENIED', 'APPEALED', 'ADJUSTER')).toBe(false);
    expect(canTransition('INFORMATION_REQUIRED', 'UNDER_REVIEW', 'PROVIDER')).toBe(true);
    expect(getAllowedTransitions('PAID', 'CLAIMANT')).toEqual([]);
  });

  it('throws on invalid transitions', () => {
    expect(() => assertTransition('REPORTED', 'PAID')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('REPORTED', 'REGISTERED')).not.toThrow();
  });
});

describe('timeline', () => {
  const entry = (toStatus: ClaimStatus, timestamp: string): AuditEntry => ({ id: toStatus, timestamp, actor: 'x', role: 'SYSTEM', action: 'status', toStatus });

  it('marks completed, current and upcoming stages', () => {
    const t = getTimeline('UNDER_REVIEW', [entry('REPORTED', '2026-09-01'), entry('REGISTERED', '2026-09-01'), entry('UNDER_REVIEW', '2026-09-02')]);
    expect(t.map((s) => s.state)).toEqual(['completed', 'completed', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('marks investigation skipped for fast-tracked claims', () => {
    const t = getTimeline('ADJUDICATION', [entry('REPORTED', '1'), entry('REGISTERED', '2'), entry('UNDER_REVIEW', '3'), entry('ADJUDICATION', '4')]);
    expect(t.find((s) => s.key === 'investigation')?.state).toBe('skipped');
  });

  it('skips payment for denied claims', () => {
    const t = getTimeline('DENIED', [entry('REPORTED', '1'), entry('DENIED', '2')]);
    expect(t.find((s) => s.key === 'payment')?.state).toBe('skipped');
  });
});
