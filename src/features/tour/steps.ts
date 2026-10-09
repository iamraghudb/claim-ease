import type { Role } from '../../domain/types';

/**
 * One stop on a guided tour.
 * - `route`: the page to be on (the tour navigates there). Omit to stay where you are.
 * - `target`: the value of a `data-tour="..."` attribute to spotlight. Omit for a centred card.
 */
export interface TourStep {
  id: string;
  route?: string;
  target?: string;
  title: string;
  body: string;
}

/**
 * Every `data-tour` anchor a step may point at. A step whose anchor is missing from the page still works
 * (the card is shown centred), so a screen can lose an anchor without breaking the tour.
 */
export const TOUR_TARGETS = [
  'start-claim',
  'claims-nav',
  'claim-timeline',
  'ease-summary',
  'ease-launcher',
  'persona-menu',
  'file-choice',
  'queue-tiles',
  'queue-table',
  'ai-brief',
  'actions-rail',
  'kpis',
  'ai-insights',
  'rules-config',
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

/** The seeded claims the tour opens. Claim numbers carry the year, see `resolveClaimRoute`. */
const MARIA_STORM_CLAIM = '/claims/CLM-2026-000103';
const MRI_CLAIM_IN_QUEUE = '/queue/CLM-2026-000105';

export const TOURS: Record<Role, TourStep[]> = {
  CLAIMANT: [
    {
      id: 'start-claim',
      route: '/',
      target: 'start-claim',
      title: 'Every claim starts here',
      body: "Tell me what happened or drop a bill and I'll do the typing.",
    },
    {
      id: 'claims-nav',
      target: 'claims-nav',
      title: 'Your claims live here',
      body: 'Open My claims any time to see every claim you have filed and where each one stands.',
    },
    {
      id: 'claim-timeline',
      route: MARIA_STORM_CLAIM,
      target: 'claim-timeline',
      title: 'Follow your claim like a parcel',
      body: 'Each step is ticked off as it happens, so you always know what comes next.',
    },
    {
      id: 'ease-summary',
      target: 'ease-summary',
      title: 'Where you stand, at a glance',
      body: "I'll explain where you stand and what, if anything, you need to do.",
    },
    {
      id: 'ease-launcher',
      target: 'ease-launcher',
      title: 'Ask me anything',
      body: 'I am on every screen. Ask me what a word means or what to do next.',
    },
    {
      id: 'persona-menu',
      target: 'persona-menu',
      title: 'See the other side',
      body: 'Switch persona here to see how an adjuster, the person who reviews claims, sees this same claim.',
    },
  ],
  PROVIDER: [
    {
      id: 'start-claim',
      route: '/',
      target: 'start-claim',
      title: 'Submit a claim from here',
      body: "Start here for any patient. I'll do the typing from what you tell me or from the bill.",
    },
    {
      id: 'file-choice',
      route: '/file',
      target: 'file-choice',
      title: 'Two ways to start',
      body: 'Tell me about the visit, or drop the itemized bill. Either way, I fill in the claim and you check it.',
    },
    {
      id: 'claims-nav',
      target: 'claims-nav',
      title: 'Track every claim',
      body: 'My claims shows each claim you have submitted and how far along it is.',
    },
    {
      id: 'ease-launcher',
      target: 'ease-launcher',
      title: 'Ask me anything',
      body: 'Not sure what a claim needs? Ask me, on any screen.',
    },
    {
      id: 'persona-menu',
      target: 'persona-menu',
      title: 'See the other side',
      body: "Switch persona here to see how the insurer's adjuster reviews a claim like yours.",
    },
  ],
  ADJUSTER: [
    {
      id: 'queue-tiles',
      route: '/queue',
      target: 'queue-tiles',
      title: 'Start here',
      body: 'These tiles are your filters. Tap one to see just that kind of claim.',
    },
    {
      id: 'queue-table',
      target: 'queue-table',
      title: 'Your work, in order',
      body: 'Every claim waiting on someone. Priority and target time tell you what to open first.',
    },
    {
      id: 'ai-brief',
      route: MRI_CLAIM_IN_QUEUE,
      target: 'ai-brief',
      title: 'My brief',
      body: 'What matters on this claim, in a glance, so you do not have to read everything first.',
    },
    {
      id: 'actions-rail',
      target: 'actions-rail',
      title: 'Decisions happen here',
      body: 'The rules engine does the maths. You decide.',
    },
    {
      id: 'ease-launcher',
      target: 'ease-launcher',
      title: 'Ask me anything',
      body: 'Ask me to explain a rule, a number or a policy term while you work.',
    },
    {
      id: 'persona-menu',
      target: 'persona-menu',
      title: 'See the other side',
      body: "Switch persona here to see what the claimant sees when you make a decision.",
    },
  ],
  ADMIN: [
    {
      id: 'kpis',
      route: '/admin',
      target: 'kpis',
      title: 'The numbers that matter',
      body: 'How many claims you have, how fast decisions are made and how often a claim needs more information.',
    },
    {
      id: 'ai-insights',
      target: 'ai-insights',
      title: 'What is slowing you down',
      body: 'I read the numbers and tell you what is slowing you down.',
    },
    {
      id: 'rules-config',
      route: '/admin/config',
      target: 'rules-config',
      title: 'Rules and target times',
      body: 'The rules and target times behind every decision live here. Change a number and the checks follow straight away.',
    },
    {
      id: 'ease-launcher',
      target: 'ease-launcher',
      title: 'Ask me anything',
      body: 'Ask me about a chart, a rule or a term, on any screen.',
    },
    {
      id: 'persona-menu',
      target: 'persona-menu',
      title: 'See the other side',
      body: 'Switch persona here to see ClaimEase as a claimant or an adjuster does.',
    },
  ],
};

const CLAIM_ROUTE = /^\/(claims|queue)\/CLM-(\d{4})-(\d{6})$/;

/**
 * Seeded claim numbers carry the year they were created in, so a step that opens "CLM-2026-000103" would point at
 * nothing once the calendar turns. Match on the sequence number instead and use whatever year the claim really has.
 */
export function resolveClaimRoute(route: string, claimNumbers: string[]): string {
  const m = CLAIM_ROUTE.exec(route);
  if (!m) return route;
  if (claimNumbers.includes(`CLM-${m[2]}-${m[3]}`)) return route;
  const match = claimNumbers.find((n) => n.endsWith(`-${m[3]}`));
  return match ? `/${m[1]}/${match}` : route;
}
