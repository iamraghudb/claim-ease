// The in-app pages the Ease copilot is allowed to send someone to. Shared by the server (to filter the
// model's answer) and the browser (to check again before rendering a button), so the AI can never
// produce a link to a page that does not exist.

import type { Role } from './types';

const CLAIM = String.raw`CLM-\d{4}-\d{6}`;
const common: RegExp[] = [/^\/glossary(#[\w-]+)?$/, /^\/notifications$/];
const claimant: RegExp[] = [/^\/$/, /^\/file$/, /^\/file\/smart$/, /^\/file\/form$/, /^\/claims$/, new RegExp(`^/claims/${CLAIM}$`), ...common];

const ALLOWED: Record<Role, RegExp[]> = {
  CLAIMANT: claimant,
  PROVIDER: claimant,
  ADJUSTER: [/^\/queue$/, new RegExp(`^/queue/${CLAIM}$`), ...common],
  ADMIN: [/^\/admin$/, /^\/admin\/config$/, /^\/queue$/, new RegExp(`^/queue/${CLAIM}$`), ...common],
};

export function isAllowedPath(role: Role, path: string): boolean {
  return ALLOWED[role].some((re) => re.test(path));
}

/** Plain-language map of the app, given to the copilot so it can say where things are. */
export const SITE_MAP: Record<Role, { path: string; what: string }[]> = {
  CLAIMANT: [
    { path: '/', what: 'Home: open claims, anything needing attention, recent updates' },
    { path: '/file', what: 'Start a claim: choose "tell Ease what happened" or the step-by-step form' },
    { path: '/file/smart', what: 'Tell Ease what happened (conversation) or drop a bill' },
    { path: '/file/form', what: 'The step-by-step claim form' },
    { path: '/claims', what: 'My claims: every claim with its progress' },
    { path: '/claims/<claim number>', what: "One claim's tracker, decision, documents and activity (only use claim numbers you were given)" },
    { path: '/notifications', what: 'All notifications' },
    { path: '/glossary', what: 'Help and plain-English glossary of insurance terms' },
  ],
  PROVIDER: [
    { path: '/', what: 'Home: submitted claims, anything needing attention, recent updates' },
    { path: '/file', what: 'Submit a claim for a patient: choose "tell Ease" or the step-by-step form' },
    { path: '/file/smart', what: 'Tell Ease about the visit, or drop the itemized bill' },
    { path: '/file/form', what: 'The step-by-step claim form' },
    { path: '/claims', what: 'Submitted claims with their progress' },
    { path: '/claims/<claim number>', what: "One claim's tracker, decision, documents and activity (only use claim numbers you were given)" },
    { path: '/notifications', what: 'All notifications' },
    { path: '/glossary', what: 'Help and plain-English glossary of insurance terms' },
  ],
  ADJUSTER: [
    { path: '/queue', what: 'Work queue: all claims with filters for priority, SLA and owner' },
    { path: '/queue/<claim number>', what: "Claim review: rules checks, payable calculation and the decision actions (only use claim numbers you were given)" },
    { path: '/notifications', what: 'All notifications' },
    { path: '/glossary', what: 'Help and glossary' },
  ],
  ADMIN: [
    { path: '/admin', what: 'Dashboard: KPIs, charts and the biggest causes of delay' },
    { path: '/admin/config', what: 'Rules and SLA configuration: thresholds and target times' },
    { path: '/queue', what: 'Work queue: all claims' },
    { path: '/queue/<claim number>', what: 'Claim review (only use claim numbers you were given)' },
    { path: '/notifications', what: 'All notifications' },
    { path: '/glossary', what: 'Help and glossary' },
  ],
};
