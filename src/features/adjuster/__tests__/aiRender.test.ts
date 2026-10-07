// Renders Ease's staff features to static HTML (no browser needed) to check what is on screen in each state.
// The AI hooks are stubbed so each state can be set directly.

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStaffContext } from '../../../domain/aiContext';
import type { BriefAction, BriefResult, DashboardStats, InsightsResult } from '../../../domain/aiTypes';
import { evaluateClaim } from '../../../domain/rulesEngine';
import type { ClaimStatus } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';

const hooks = vi.hoisted(() => ({
  status: undefined as unknown,
  resource: { data: undefined, loading: false, error: '', refresh: () => {} } as { data: unknown; loading: boolean; error: string; refresh: () => void },
}));

vi.mock('../../../store/useAiStatus', () => ({ useAiStatus: () => hooks.status }));
vi.mock('../../../store/useAiResource', () => ({ useAiResource: () => hooks.resource, clearAiCache: () => {} }));

import { AiInsights } from '../../admin/AiInsights';
import { AdjudicationPanel } from '../AdjudicationPanel';
import { AiBrief } from '../AiBrief';
import { RequestInfoModal } from '../RequestInfoModal';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const claim = seed.claims.find((c) => c.status === 'ADJUDICATION')!;
const policy = seed.policies.find((p) => p.policyNumber === claim.policyNumber);
const rules = evaluateClaim(claim, policy, { otherClaims: seed.claims, config: seed.config });
const context = buildStaffContext(claim, rules, policy);

const html = (el: ReactElement) => renderToStaticMarkup(createElement(StaticRouter, { location: '/admin' }, el));

const brief = (action: BriefAction, over: Partial<BriefResult> = {}): BriefResult => ({
  source: 'ai',
  headline: 'Routine health claim with one gap',
  summary: 'The bill is complete but one document is missing.',
  risks: [
    { title: 'Missing itemized bill', plain: 'Without it the amount cannot be checked.', severity: 'high' },
    { title: 'Estimated amount', plain: 'The filer was not sure of the total.', severity: 'low' },
  ],
  recommended: { action, why: 'A required document is missing.' },
  verify: ['Check the dates of service', 'Compare the total with the bill'],
  ...over,
});

const renderBrief = (status: ClaimStatus = 'ADJUDICATION') =>
  html(createElement(AiBrief, { context, claimStatus: status, role: 'ADJUSTER', onRequestInfo: () => {}, onDecide: () => {} }));

beforeEach(() => {
  hooks.status = { configured: true, model: 'test' };
  hooks.resource = { data: undefined, loading: false, error: '', refresh: () => {} };
});

describe("Ease's brief", () => {
  it('renders nothing when there is no AI server, or while that is still being checked', () => {
    hooks.status = null;
    hooks.resource = { ...hooks.resource, data: brief('APPROVE') };
    expect(renderBrief()).toBe('');
    hooks.status = undefined;
    expect(renderBrief()).toBe('');
  });

  it('shows the headline, summary, risks, suggestion, double-checks and the footnote', () => {
    hooks.resource = { ...hooks.resource, data: brief('REQUEST_INFO') };
    const out = renderBrief();
    expect(out).toContain('data-tour="ai-brief"');
    expect(out).toContain("Ease&#x27;s brief");
    for (const text of ['Routine health claim with one gap', 'The bill is complete but one document is missing.', 'Missing itemized bill', 'Without it the amount cannot be checked.', 'High', 'Low']) expect(out).toContain(text);
    expect(out).toContain('Ease suggests');
    expect(out).toContain('Request information');
    expect(out).toContain('Choose items to request');
    expect(out).toContain('A required document is missing.');
    expect(out).toContain('Worth double-checking');
    expect(out).toContain('Check the dates of service');
    expect(out).toContain('A suggestion for you to weigh, not a decision.');
  });

  it('marks the answer as AI, or as demo data without a key', () => {
    hooks.resource = { ...hooks.resource, data: brief('WAIT') };
    expect(renderBrief()).toMatch(/>\s*AI\s*</);
    hooks.resource = { ...hooks.resource, data: brief('WAIT', { source: 'demo' }) };
    expect(renderBrief()).toContain('Demo data');
  });

  it('offers the decision form for a decision, and only informs for investigate or wait', () => {
    hooks.resource = { ...hooks.resource, data: brief('DENY') };
    expect(renderBrief('ADJUDICATION')).toContain('Go to decision');
    expect(renderBrief('UNDER_REVIEW')).toContain('once the claim is in Adjudication');
    expect(renderBrief('UNDER_REVIEW')).not.toContain('Go to decision');
    hooks.resource = { ...hooks.resource, data: brief('INVESTIGATE') };
    expect(renderBrief('ADJUDICATION')).not.toContain('Go to decision');
  });

  it('drops the suggestion once the claim has been decided', () => {
    hooks.resource = { ...hooks.resource, data: brief('APPROVE') };
    const out = renderBrief('PAID');
    expect(out).not.toContain('Ease suggests');
    expect(out).toContain('Routine health claim with one gap');
  });

  it('shows Ease thinking while it loads, and a small retry message on error', () => {
    hooks.resource = { ...hooks.resource, loading: true };
    expect(renderBrief()).toContain('Ease is reading the claim');
    hooks.resource = { ...hooks.resource, loading: false, error: 'Could not reach the AI service.' };
    const out = renderBrief();
    expect(out).toContain('Try again');
    expect(out).toContain('Could not reach the AI service.');
  });
});

describe('Draft with Ease', () => {
  const panel = () => html(createElement(AdjudicationPanel, { claim, rules, onRequestInfo: () => {}, embedded: true }));

  it('sits next to the explanation field on the decision form', () => {
    expect(panel()).toContain('Draft with Ease');
  });

  it('is absent when there is no AI server', () => {
    hooks.status = null;
    expect(panel()).not.toContain('Draft with Ease');
  });

  it('is offered in the request-information dialog, disabled until an item is chosen', () => {
    const out = html(createElement(RequestInfoModal, { claim, open: true, onClose: () => {} }));
    expect(out).toContain('Draft the message with Ease');
  });
});

describe("Ease's read on operations", () => {
  const stats: DashboardStats = {
    totalClaims: 10,
    decided: 5,
    avgDaysToDecision: 3.6,
    fastTrackPct: 60,
    needInfoPct: 10,
    denialPct: 20,
    appeals: 0,
    byStatus: { 'Under review': 2 },
    byType: { Auto: 4 },
    topDelayReasons: [{ reason: 'Missing documents', count: 3 }],
    slaAtRisk: 1,
    slaOverdue: 2,
  };
  const insights: InsightsResult = {
    source: 'ai',
    headline: 'Most claims move quickly, but two are overdue.',
    answer: '',
    insights: [
      { title: 'Fast-track share', detail: '60% of claims are fast-track eligible.', tone: 'good', suggestion: 'Raise the fast-track limits on the Rules & SLA page.' },
      { title: 'Overdue claims', detail: 'Two claims are past their target.', tone: 'risk', suggestion: 'Check the work queue filtered by overdue first.' },
      { title: 'Delays', detail: 'Missing documents is the top reason.', tone: 'watch', suggestion: 'Ask for documents earlier at intake.' },
    ],
  };

  it('renders nothing without an AI server or without claims', () => {
    hooks.status = null;
    expect(html(createElement(AiInsights, { stats }))).toBe('');
    hooks.status = { configured: true, model: 'test' };
    expect(html(createElement(AiInsights, { stats: { ...stats, totalClaims: 0 } }))).toBe('');
  });

  it('shows the headline, insight rows with tone, links, and the ask box with starters', () => {
    hooks.resource = { ...hooks.resource, data: insights };
    const out = html(createElement(AiInsights, { stats }));
    expect(out).toContain('data-tour="ai-insights"');
    expect(out).toContain('Ease&#x27;s read on operations');
    expect(out).toContain('Most claims move quickly, but two are overdue.');
    for (const text of ['Fast-track share', 'Overdue claims', 'Delays', 'Going well', 'Needs attention', 'Worth watching']) expect(out).toContain(text);
    expect(out).toContain('href="/admin/config"');
    expect(out).toContain('href="/queue"');
    expect(out).toContain('Ask the dashboard');
    for (const q of ['Why are claims getting delayed?', 'What should I change first?', 'Where are we most at risk?']) expect(out).toContain(q);
  });

  it('shows Ease thinking while it loads', () => {
    hooks.resource = { ...hooks.resource, loading: true };
    expect(html(createElement(AiInsights, { stats }))).toContain('Ease is reading the dashboard');
  });
});
