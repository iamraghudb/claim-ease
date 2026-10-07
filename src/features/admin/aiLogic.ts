// Small pure helpers behind the admin screens' Ease features. No React, no I/O.

import type { ChatTurn, CopilotPage, DashboardStats } from '../../domain/aiTypes';
import type { RulesConfig } from '../../domain/types';

export const INSIGHT_STARTERS = ['Why are claims getting delayed?', 'What should I change first?', 'Where are we most at risk?'];

/** One question and Ease's answer to it. */
export interface AskedQuestion {
  question: string;
  answer: string;
}

/** How many earlier exchanges are sent along with a new question. Keeps the request small. */
const HISTORY_EXCHANGES = 3;

/** The earlier exchanges in the shape the server expects, oldest first. */
export function historyFrom(thread: readonly AskedQuestion[]): ChatTurn[] {
  return thread
    .slice(-HISTORY_EXCHANGES)
    .flatMap((t): ChatTurn[] => [
      { role: 'user', text: t.question },
      { role: 'assistant', text: t.answer },
    ]);
}

export interface SuggestionLink {
  to: string;
  label: string;
}

/**
 * Ease's suggestions are free text. When one is about tuning a rule, threshold or target time we offer a button
 * to the settings page; when it is about the queue we offer the queue. Anything else gets no button.
 */
export function suggestionLink(suggestion: string): SuggestionLink | null {
  if (/rules\s*(?:&|and)\s*sla|thresholds?|fast-?track limits?|sla targets?|target times?|at-?risk warning|\bconfig|\bsettings?\b/i.test(suggestion)) {
    return { to: '/admin/config', label: 'Open Rules & SLA settings' };
  }
  if (/\b(?:work queue|the queue)\b/i.test(suggestion)) return { to: '/queue', label: 'Open the work queue' };
  return null;
}

/** Tells Ease what the operations dashboard shows. The data is the same counts the insights are written from. */
export function dashboardPage(stats: DashboardStats): CopilotPage {
  return {
    path: '/admin',
    title: 'Operations dashboard',
    summary: 'KPIs, claims by status and type, the biggest causes of delay, and how many claims are at risk or overdue against their target times.',
    data: stats,
    suggestions: ['What is slowing us down?', 'Which numbers should I worry about?', 'How can I speed things up?'],
  };
}

/** Tells Ease what the settings page holds: the live thresholds and target times (not unsaved edits). */
export function configPage(config: RulesConfig, hasUnsavedChanges: boolean): CopilotPage {
  return {
    path: '/admin/config',
    title: 'Rules and SLA settings',
    summary: 'The thresholds and target times that decide priority, fast-track eligibility and fraud flags. Changes apply as soon as they are saved.',
    data: { currentSettings: config, hasUnsavedChanges },
    suggestions: ['What does the high-value threshold do?', 'What happens if I raise the fast-track limit?', 'Which setting would speed up claims most?'],
  };
}
