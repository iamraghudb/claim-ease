import { useEffect, useRef } from 'react';
import type { CopilotPage } from '../../domain/aiTypes';
import type { Role } from '../../domain/types';
import { useCopilotStore } from './copilotStore';

const CLAIM = String.raw`CLM-\d{4}-\d{6}`;

interface Entry {
  test: RegExp;
  /** Which roles this entry is for. Omit for everyone. */
  roles?: Role[];
  title: (m: RegExpMatchArray) => string;
  summary: string;
  suggestions: string[];
  data?: (m: RegExpMatchArray) => unknown;
}

const CUSTOMER: Role[] = ['CLAIMANT', 'PROVIDER'];

const ENTRIES: Entry[] = [
  {
    test: /^\/$/,
    roles: CUSTOMER,
    title: () => 'Home',
    summary: 'The home page: open claims, anything the insurer needs from you, and recent updates.',
    suggestions: ['How do I file a claim?', 'What does each claim status mean?', 'What should I do first?'],
  },
  {
    test: /^\/file$/,
    roles: CUSTOMER,
    title: () => 'Start a claim',
    summary: 'Where you choose how to file: tell Ease what happened, or fill in the step-by-step form.',
    suggestions: ['Which way is quicker?', 'What will I need to have ready?'],
  },
  {
    test: /^\/file\/smart$/,
    roles: CUSTOMER,
    title: () => 'Tell Ease what happened',
    summary: 'A conversation where you describe what happened, or drop a bill, and Ease builds the claim.',
    suggestions: [],
  },
  {
    test: /^\/file\/form$/,
    roles: CUSTOMER,
    title: () => 'Claim form',
    summary: 'The step-by-step claim form: policy, documents, details, then review.',
    suggestions: ['What documents do I need?', 'What does "I\'m not sure" do?', 'What happens after I submit?'],
  },
  {
    test: /^\/claims$/,
    roles: CUSTOMER,
    title: () => 'My claims',
    summary: 'Every claim with its progress, status and anything that needs attention.',
    suggestions: ['Which claim needs my attention?', 'What do the statuses mean?'],
  },
  {
    test: new RegExp(`^/claims/(${CLAIM})$`),
    roles: CUSTOMER,
    title: (m) => `Claim ${m[1]}`,
    summary: "One claim's tracker: its progress, status, decision, documents and activity.",
    suggestions: ['Where does my claim stand?', 'What do I need to do next?', 'How long will this take?'],
    data: (m) => ({ claimNumber: m[1] }),
  },
  {
    test: new RegExp(`^/claims/(${CLAIM})/file$`),
    roles: CUSTOMER,
    title: (m) => `Claim file for ${m[1]}`,
    summary: 'A printable summary of the whole claim.',
    suggestions: [],
    data: (m) => ({ claimNumber: m[1] }),
  },
  {
    test: new RegExp(`^/health/(${CLAIM})$`),
    title: (m) => `Health claim flow for ${m[1]}`,
    summary: 'How a health claim moves between patient, provider and insurer, with the 837-style claim, the 277-style status and the 835-style remittance.',
    suggestions: ['What is the 835 remittance?', 'Why does the patient owe this amount?', 'What happens next?'],
    data: (m) => ({ claimNumber: m[1] }),
  },
  {
    test: /^\/queue$/,
    roles: ['ADJUSTER', 'ADMIN'],
    title: () => 'Work queue',
    summary: 'All claims with filters for type, status, priority, SLA and owner, plus quick-filter tiles.',
    suggestions: ['What should I work on first?', 'What does "uncertainty" mean here?', 'What is fast-track?'],
  },
  {
    test: new RegExp(`^/queue/(${CLAIM})$`),
    roles: ['ADJUSTER', 'ADMIN'],
    title: (m) => `Claim review ${m[1]}`,
    summary: 'The claim review screen: rules checks, the payable calculation, documents and the decision actions.',
    suggestions: ['What should I look at first?', 'Why is this claim flagged?', 'What would you recommend?'],
    data: (m) => ({ claimNumber: m[1] }),
  },
  {
    test: /^\/admin$/,
    roles: ['ADMIN'],
    title: () => 'Operations dashboard',
    summary: 'KPIs, claims by status and type, and the biggest causes of delay.',
    suggestions: ['What is slowing us down?', 'Which numbers should I worry about?', 'How can I speed things up?'],
  },
  {
    test: /^\/admin\/config$/,
    roles: ['ADMIN'],
    title: () => 'Rules and SLA settings',
    summary: 'The thresholds and target times that decide priority, fast-track eligibility and fraud flags.',
    suggestions: ['What does the high-value threshold do?', 'What happens if I raise the fast-track limit?'],
  },
  {
    test: /^\/notifications$/,
    title: () => 'Notifications',
    summary: 'Every notification, grouped by day, filterable by type.',
    suggestions: ['Which notification needs action?'],
  },
  {
    test: /^\/glossary/,
    title: () => 'Help and glossary',
    summary: 'Plain-English explanations of insurance terms.',
    suggestions: ['Explain "deductible" simply', 'What is the difference between copay and coinsurance?'],
  },
];

/** What Ease knows about a screen from the address alone. Screens that know more call useCopilotPage. */
export function defaultPage(pathname: string, role: Role): CopilotPage {
  for (const e of ENTRIES) {
    if (e.roles && !e.roles.includes(role)) continue;
    const m = pathname.match(e.test);
    if (m) return { path: pathname, title: e.title(m), summary: e.summary, suggestions: e.suggestions, data: e.data?.(m) };
  }
  return { path: pathname, title: 'ClaimEase', summary: 'ClaimEase helps people file insurance claims and follow them to the end.', suggestions: [] };
}

/** Starter questions when a screen offers none. */
export const GENERIC_SUGGESTIONS: Record<Role, string[]> = {
  CLAIMANT: ['How do I file a claim?', 'What does "deductible" mean?', 'What should I do first?'],
  PROVIDER: ['How do I submit a claim for a patient?', 'What does the 835 remittance show?', 'What should I do first?'],
  ADJUSTER: ['What should I work on first?', 'How does fast-track work?', 'How is uncertainty scored?'],
  ADMIN: ['What is slowing us down?', 'What do the rules and SLA settings do?', 'What should I look at first?'],
};

/**
 * Tells Ease what this screen is showing, so its answers are about what the person is actually looking at.
 * Pass a small JSON-safe `data` snapshot. Pass null/undefined while nothing is loaded yet.
 */
export function useCopilotPage(page: CopilotPage | null | undefined) {
  const setSpecific = useCopilotStore((s) => s.setSpecific);
  const key = page ? JSON.stringify(page) : '';
  const latest = useRef(key);
  latest.current = key;
  useEffect(() => {
    setSpecific(latest.current ? (JSON.parse(latest.current) as CopilotPage) : null);
    return () => setSpecific(null);
  }, [key, setSpecific]);
}
