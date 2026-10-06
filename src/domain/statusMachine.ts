import type { AuditEntry, ClaimStatus, Role } from './types';

// Single source of truth for the claim lifecycle. The UI asks this module which
// actions are possible, and the service layer refuses anything else.

export interface Transition {
  to: ClaimStatus;
  label: string;
  roles: Role[];
}

const STAFF: Role[] = ['ADJUSTER', 'ADMIN'];
const FILERS: Role[] = ['CLAIMANT', 'PROVIDER'];

export const TRANSITIONS: Record<ClaimStatus, Transition[]> = {
  REPORTED: [{ to: 'REGISTERED', label: 'Register claim', roles: [...STAFF, ...FILERS] }],
  REGISTERED: [{ to: 'UNDER_REVIEW', label: 'Start review', roles: STAFF }],
  UNDER_REVIEW: [
    { to: 'INFORMATION_REQUIRED', label: 'Request information', roles: STAFF },
    { to: 'INVESTIGATION', label: 'Move to investigation', roles: STAFF },
    { to: 'ADJUDICATION', label: 'Send to adjudication', roles: STAFF },
  ],
  INFORMATION_REQUIRED: [
    { to: 'UNDER_REVIEW', label: 'Submit requested information', roles: [...STAFF, ...FILERS] },
  ],
  INVESTIGATION: [
    { to: 'ADJUDICATION', label: 'Send to adjudication', roles: STAFF },
    { to: 'INFORMATION_REQUIRED', label: 'Request information', roles: STAFF },
  ],
  ADJUDICATION: [
    { to: 'APPROVED', label: 'Approve', roles: STAFF },
    { to: 'PARTIALLY_APPROVED', label: 'Partially approve', roles: STAFF },
    { to: 'DENIED', label: 'Deny', roles: STAFF },
    { to: 'INFORMATION_REQUIRED', label: 'Request information', roles: STAFF },
  ],
  APPROVED: [{ to: 'PAYMENT_PENDING', label: 'Queue payment', roles: STAFF }],
  PARTIALLY_APPROVED: [
    { to: 'PAYMENT_PENDING', label: 'Queue payment', roles: STAFF },
    { to: 'APPEALED', label: 'File an appeal', roles: FILERS },
  ],
  DENIED: [
    { to: 'APPEALED', label: 'File an appeal', roles: FILERS },
    { to: 'CLOSED', label: 'Close claim', roles: STAFF },
  ],
  APPEALED: [
    { to: 'ADJUDICATION', label: 'Re-adjudicate', roles: STAFF },
    { to: 'UNDER_REVIEW', label: 'Return to review', roles: STAFF },
  ],
  PAYMENT_PENDING: [{ to: 'PAID', label: 'Mark payment issued', roles: STAFF }],
  PAID: [{ to: 'CLOSED', label: 'Close claim', roles: STAFF }],
  CLOSED: [{ to: 'REOPENED', label: 'Reopen claim', roles: STAFF }],
  REOPENED: [{ to: 'UNDER_REVIEW', label: 'Start review', roles: STAFF }],
};

export const ALL_STATUSES = Object.keys(TRANSITIONS) as ClaimStatus[];

export const TERMINAL_STATUSES: ClaimStatus[] = ['CLOSED'];
export const DECISION_STATUSES: ClaimStatus[] = ['APPROVED', 'PARTIALLY_APPROVED', 'DENIED'];
/** Statuses where the claim is waiting on the insurer (counts against SLA). */
export const OPEN_INSURER_STATUSES: ClaimStatus[] = [
  'REPORTED',
  'REGISTERED',
  'UNDER_REVIEW',
  'INVESTIGATION',
  'ADJUDICATION',
  'APPEALED',
  'REOPENED',
];

export function getAllowedTransitions(from: ClaimStatus, role?: Role): Transition[] {
  const list = TRANSITIONS[from] ?? [];
  return role ? list.filter((t) => t.roles.includes(role)) : list;
}

export function canTransition(from: ClaimStatus, to: ClaimStatus, role?: Role): boolean {
  return getAllowedTransitions(from, role).some((t) => t.to === to);
}

export class InvalidTransitionError extends Error {
  constructor(from: ClaimStatus, to: ClaimStatus, role?: Role) {
    super(`Transition ${from} → ${to} is not allowed${role ? ` for role ${role}` : ''}.`);
    this.name = 'InvalidTransitionError';
  }
}

export function assertTransition(from: ClaimStatus, to: ClaimStatus, role?: Role): void {
  if (!canTransition(from, to, role)) throw new InvalidTransitionError(from, to, role);
}

export const STATUS_LABELS: Record<ClaimStatus, string> = {
  REPORTED: 'Reported',
  REGISTERED: 'Registered',
  UNDER_REVIEW: 'Under review',
  INFORMATION_REQUIRED: 'Information required',
  INVESTIGATION: 'Investigation',
  ADJUDICATION: 'Adjudication',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially approved',
  DENIED: 'Denied',
  APPEALED: 'Appealed',
  PAYMENT_PENDING: 'Payment pending',
  PAID: 'Paid',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

export const STATUS_DESCRIPTIONS: Record<ClaimStatus, string> = {
  REPORTED: 'First notice of loss received.',
  REGISTERED: 'Claim number issued and the claim is queued for an adjuster.',
  UNDER_REVIEW: 'An adjuster is reviewing the claim, policy, and documents.',
  INFORMATION_REQUIRED: 'We need a few more items from you before we can continue.',
  INVESTIGATION: 'Additional investigation (inspection, experts, liability) is under way.',
  ADJUDICATION: 'Coverage and payable amount are being decided.',
  APPROVED: 'The claim was approved in full.',
  PARTIALLY_APPROVED: 'Part of the claim was approved. You may appeal the decision.',
  DENIED: 'The claim was denied. You may appeal the decision.',
  APPEALED: 'Your appeal is being reviewed by a different examiner.',
  PAYMENT_PENDING: 'Payment is being prepared.',
  PAID: 'Payment has been issued.',
  CLOSED: 'The claim is closed.',
  REOPENED: 'The claim was reopened for further review.',
};

// ---------- Lifecycle timeline ----------

export type StageState = 'completed' | 'current' | 'upcoming' | 'skipped';

export interface TimelineStage {
  key: string;
  label: string;
  state: StageState;
  date?: string;
  statuses: ClaimStatus[];
}

const STAGES: { key: string; label: string; statuses: ClaimStatus[]; optional?: boolean }[] = [
  { key: 'reported', label: 'Reported', statuses: ['REPORTED'] },
  { key: 'registered', label: 'Registered', statuses: ['REGISTERED'] },
  { key: 'review', label: 'Under review', statuses: ['UNDER_REVIEW', 'INFORMATION_REQUIRED', 'REOPENED'] },
  { key: 'investigation', label: 'Investigation', statuses: ['INVESTIGATION'], optional: true },
  { key: 'adjudication', label: 'Adjudication', statuses: ['ADJUDICATION', 'APPEALED'] },
  { key: 'decision', label: 'Decision', statuses: ['APPROVED', 'PARTIALLY_APPROVED', 'DENIED'] },
  { key: 'payment', label: 'Payment', statuses: ['PAYMENT_PENDING', 'PAID'] },
  { key: 'closed', label: 'Closed', statuses: ['CLOSED'] },
];

/** Builds the visual lifecycle from the current status plus the audit trail. */
export function getTimeline(status: ClaimStatus, auditTrail: AuditEntry[]): TimelineStage[] {
  const reached = new Map<ClaimStatus, string>();
  for (const e of auditTrail) {
    if (e.toStatus && !reached.has(e.toStatus)) reached.set(e.toStatus, e.timestamp);
  }
  reached.set(status, reached.get(status) ?? new Date().toISOString());

  const currentIdx = STAGES.findIndex((s) => s.statuses.includes(status));
  return STAGES.map((stage, idx) => {
    const firstDate = stage.statuses
      .map((s) => reached.get(s))
      .filter(Boolean)
      .sort()[0];
    let state: StageState;
    if (idx === currentIdx) state = status === 'CLOSED' ? 'completed' : 'current';
    else if (idx < currentIdx) state = firstDate ? 'completed' : stage.optional ? 'skipped' : 'completed';
    else state = 'upcoming';
    // A denied claim does not go through payment.
    if (stage.key === 'payment' && idx > currentIdx && status === 'DENIED') state = 'skipped';
    if (stage.key === 'payment' && status === 'CLOSED' && !firstDate) state = 'skipped';
    return { key: stage.key, label: stage.label, state, date: firstDate, statuses: stage.statuses };
  });
}
