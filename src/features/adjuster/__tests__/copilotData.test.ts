import { describe, expect, it } from 'vitest';
import { buildStaffContext } from '../../../domain/aiContext';
import { evaluateClaim } from '../../../domain/rulesEngine';
import type { Claim, RulesResult } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { QUEUE_CLAIM_LIMIT, queuePage, reviewPage } from '../copilotData';

const NOW = new Date('2026-10-06T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const seed = buildSeed(NOW);
const rulesFor = (claims: Claim[]): Map<string, RulesResult> =>
  new Map(claims.map((c) => [c.claimNumber, evaluateClaim(c, seed.policies.find((p) => p.policyNumber === c.policyNumber), { otherClaims: claims, config: seed.config })]));

type QueueData = { counts: Record<string, number>; claims: { claimNumber: string; type: string; status: string; priority: string; slaState: string; amount: number }[] };
const queue = (claims: Claim[]) => queuePage(claims, rulesFor(claims), seed.config, NOW);
const queueData = (claims: Claim[]) => queue(claims).data as QueueData;

describe('queuePage', () => {
  it('registers the work queue with the five tile counts', () => {
    const page = queue(seed.claims);
    expect(page.path).toBe('/queue');
    expect(page.title).toBe('Work queue');
    const open = seed.claims.filter((c) => c.status !== 'CLOSED' && c.status !== 'PAID');
    expect((page.data as QueueData).counts).toEqual({
      open: open.length,
      atRisk: 0,
      overdue: 0,
      fastTrack: expect.any(Number),
      unassigned: open.filter((c) => !c.assignedAdjuster).length,
    });
    expect(page.suggestions?.length).toBeGreaterThan(0);
  });

  it('lists open claims only, in plain words', () => {
    const { claims } = queueData(seed.claims);
    expect(claims.length).toBe(seed.claims.filter((c) => c.status !== 'CLOSED' && c.status !== 'PAID').length);
    expect(claims.map((c) => c.claimNumber)).not.toContain(seed.claims.find((c) => c.status === 'CLOSED')!.claimNumber);
    for (const c of claims) {
      expect(c.claimNumber).toMatch(/^CLM-\d{4}-\d{6}$/);
      expect(['Auto', 'Property', 'Health']).toContain(c.type);
      expect(c.status).not.toMatch(/_/);
      expect(['Urgent', 'High', 'Normal', 'Low']).toContain(c.priority);
      expect(c.slaState).toMatch(/^[A-Z][a-z]/);
      expect(typeof c.amount).toBe('number');
    }
  });

  it('carries no names or policy numbers', () => {
    const json = JSON.stringify(queue(seed.claims));
    for (const c of seed.claims) {
      expect(json).not.toContain(c.claimantName);
      expect(json).not.toContain(c.policyNumber);
      if (c.assignedAdjuster) expect(json).not.toContain(c.assignedAdjuster);
    }
  });

  it('puts overdue claims first, then at risk, then the rest', () => {
    const base = seed.claims.find((c) => c.status === 'UNDER_REVIEW')!;
    const mk = (n: number, createdDaysAgo: number, dueInDays: number): Claim => ({
      ...base,
      claimNumber: `CLM-2026-0091${n}0`,
      slaStartedAt: undefined,
      createdAt: iso(NOW.getTime() - createdDaysAgo * DAY),
      slaDueDate: iso(NOW.getTime() + dueInDays * DAY),
    });
    const claims = [mk(1, 1, 9), mk(2, 20, -1), mk(3, 9, 1)];
    const { claims: listed } = queueData(claims);
    expect(listed.map((c) => c.slaState)).toEqual(['Overdue', 'At risk', 'On track']);
    expect(queueData(claims).counts).toMatchObject({ open: 3, overdue: 1, atRisk: 1 });
  });

  it('lists at most 15 claims but counts all of them', () => {
    const base = seed.claims.find((c) => c.status === 'UNDER_REVIEW')!;
    const many = Array.from({ length: 40 }, (_, i): Claim => ({ ...base, claimNumber: `CLM-2026-${String(900000 + i)}` }));
    const data = queueData(many);
    expect(data.claims).toHaveLength(QUEUE_CLAIM_LIMIT);
    expect(QUEUE_CLAIM_LIMIT).toBe(15);
    expect(data.counts.open).toBe(40);
  });

  it('survives JSON', () => {
    const page = queue(seed.claims);
    expect(JSON.parse(JSON.stringify(page))).toEqual(page);
  });

  it('handles an empty queue', () => {
    expect(queueData([])).toEqual({ counts: { open: 0, atRisk: 0, overdue: 0, fastTrack: 0, unassigned: 0 }, claims: [] });
  });
});

describe('reviewPage', () => {
  const claim = seed.claims.find((c) => c.status === 'ADJUDICATION')!;
  const policy = seed.policies.find((p) => p.policyNumber === claim.policyNumber);
  const rules = rulesFor(seed.claims).get(claim.claimNumber)!;
  const noisy: Claim = {
    ...claim,
    notes: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, author: 'Alex', role: 'ADJUSTER' as const, createdAt: claim.createdAt, text: `Note ${i} ${'x'.repeat(300)}` })),
  };
  const ctx = buildStaffContext(noisy, rules, policy);
  const page = reviewPage(claim.claimNumber, ctx);
  const data = page.data as Record<string, unknown> & { notes: string[]; checks: { explanation: string }[] };

  it('registers the review screen under the claim number', () => {
    expect(page.path).toBe(`/queue/${claim.claimNumber}`);
    expect(page.title).toBe(`Claim review ${claim.claimNumber}`);
    expect(data.claimNumber).toBe(claim.claimNumber);
    expect(page.suggestions).toEqual(['What should I look at first?', 'Why is this claim flagged?', 'What would you recommend?']);
  });

  it('carries the findings Ease needs to answer questions about the claim', () => {
    expect(data).toMatchObject({ claimType: ctx.claimType, status: ctx.status, priority: ctx.priority, uncertaintyScore: ctx.uncertaintyScore, fastTrackEligible: ctx.fastTrackEligible });
    expect(data.checks.length).toBe(ctx.checks.length);
    expect(data.payable).toEqual(ctx.payable);
  });

  it('is a trimmed copy: few notes, short text', () => {
    expect(data.notes.length).toBe(3);
    expect(data.notes.every((n) => n.length <= 160)).toBe(true);
    expect(data.checks.every((c) => c.explanation.length <= 160)).toBe(true);
  });

  it('carries no names or policy numbers (the claim number is there on purpose)', () => {
    const json = JSON.stringify(page);
    expect(json).not.toContain(claim.claimantName);
    expect(json).not.toContain(claim.policyNumber);
    const withoutNumber = JSON.stringify({ ...page, path: '', title: '', data: { ...data, claimNumber: '' } });
    expect(withoutNumber).not.toContain(claim.claimNumber);
  });

  it('survives JSON', () => {
    expect(JSON.parse(JSON.stringify(page))).toEqual(page);
  });
});
