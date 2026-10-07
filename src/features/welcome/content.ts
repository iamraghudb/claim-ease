import type { Role } from '../../domain/types';

export interface WelcomePersona {
  role: Role;
  /** Short form for buttons: "Start as Maria". */
  short: string;
  /** What the person is, in plain words. */
  roleLabel: string;
  tone: 'teal' | 'sky' | 'indigo' | 'amber';
  /** First person, one line. */
  story: string;
  /** What they will see in ClaimEase. */
  sees: string;
}

export const WELCOME_PERSONAS: WelcomePersona[] = [
  {
    role: 'CLAIMANT',
    short: 'Maria',
    roleLabel: 'Claimant',
    tone: 'teal',
    story: 'I have a claim to file.',
    sees: 'A friendly way to file, a live tracker for each claim, and updates in plain English.',
  },
  {
    role: 'PROVIDER',
    short: 'Dr. Shah',
    roleLabel: 'Healthcare provider',
    tone: 'sky',
    story: 'I submit claims for my patients.',
    sees: 'Bills read for you, a check for anything missing before you submit, and every claim tracked to payment.',
  },
  {
    role: 'ADJUSTER',
    short: 'Alex',
    roleLabel: 'Claims adjuster',
    tone: 'indigo',
    story: 'I review claims and make decisions.',
    sees: 'A work queue, a short brief from Ease on every claim, and the rules engine working out the numbers.',
  },
  {
    role: 'ADMIN',
    short: 'Jordan',
    roleLabel: 'Operations admin',
    tone: 'amber',
    story: 'I keep claims operations running.',
    sees: 'Live numbers, what Ease thinks is slowing things down, and the rules and target times you can change.',
  },
];
