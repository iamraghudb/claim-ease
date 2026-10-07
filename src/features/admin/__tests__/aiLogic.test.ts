import { describe, expect, it } from 'vitest';
import type { DashboardStats } from '../../../domain/aiTypes';
import { DEFAULT_RULES_CONFIG } from '../../../domain/config';
import { configPage, dashboardPage, historyFrom, INSIGHT_STARTERS, suggestionLink } from '../aiLogic';

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

describe('suggestionLink', () => {
  it('points rule and threshold suggestions at the settings page', () => {
    expect(suggestionLink('Raise the fast-track limits on the Rules & SLA page to send more claims through quickly.')?.to).toBe('/admin/config');
    expect(suggestionLink('Lower the high-value threshold for property claims.')?.to).toBe('/admin/config');
    expect(suggestionLink('Review the SLA targets for complex auto claims.')?.to).toBe('/admin/config');
  });

  it('points queue suggestions at the work queue', () => {
    expect(suggestionLink('Check the work queue filtered by overdue first.')).toEqual({ to: '/queue', label: 'Open the work queue' });
  });

  it('offers no button for advice that is not about a page', () => {
    expect(suggestionLink('Ask for this earlier at intake so adjusters do not have to chase it.')).toBeNull();
    expect(suggestionLink('')).toBeNull();
  });

  it('prefers the settings page when a suggestion mentions both', () => {
    expect(suggestionLink('Change the threshold, then check the work queue.')?.to).toBe('/admin/config');
  });
});

describe('historyFrom', () => {
  it('turns earlier exchanges into alternating turns, oldest first', () => {
    expect(historyFrom([{ question: 'Q1', answer: 'A1' }])).toEqual([
      { role: 'user', text: 'Q1' },
      { role: 'assistant', text: 'A1' },
    ]);
  });

  it('keeps only the most recent exchanges', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }));
    const turns = historyFrom(many);
    expect(turns).toHaveLength(6);
    expect(turns[0].text).toBe('Q3');
    expect(turns.at(-1)?.text).toBe('A5');
  });

  it('is empty when nothing has been asked', () => {
    expect(historyFrom([])).toEqual([]);
  });
});

describe('INSIGHT_STARTERS', () => {
  it('offers the three starter questions', () => {
    expect(INSIGHT_STARTERS).toEqual(['Why are claims getting delayed?', 'What should I change first?', 'Where are we most at risk?']);
  });
});

describe('what Ease is told about the admin screens', () => {
  it('describes the dashboard with the same counts the insights use', () => {
    const page = dashboardPage(stats);
    expect(page.path).toBe('/admin');
    expect(page.data).toBe(stats);
    expect(page.suggestions?.length).toBeGreaterThan(0);
  });

  it('describes the settings page with the live thresholds', () => {
    const page = configPage(DEFAULT_RULES_CONFIG, true);
    expect(page.path).toBe('/admin/config');
    expect(page.data).toEqual({ currentSettings: DEFAULT_RULES_CONFIG, hasUnsavedChanges: true });
    expect(JSON.parse(JSON.stringify(page))).toEqual(page);
  });
});
