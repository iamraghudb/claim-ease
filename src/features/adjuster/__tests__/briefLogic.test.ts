import { describe, expect, it } from 'vitest';
import type { BriefAction } from '../../../domain/aiTypes';
import { ALL_STATUSES } from '../../../domain/statusMachine';
import { ACTION_META, awaitsDecision, briefCta, decisionFor } from '../briefLogic';

const ACTIONS = Object.keys(ACTION_META) as BriefAction[];

describe('decisionFor', () => {
  it('maps the three decision actions onto the decision form choices', () => {
    expect(decisionFor('APPROVE')).toBe('APPROVED');
    expect(decisionFor('PARTIALLY_APPROVE')).toBe('PARTIALLY_APPROVED');
    expect(decisionFor('DENY')).toBe('DENIED');
  });

  it('is null for everything that is not a decision', () => {
    expect(decisionFor('REQUEST_INFO')).toBeNull();
    expect(decisionFor('INVESTIGATE')).toBeNull();
    expect(decisionFor('WAIT')).toBeNull();
  });
});

describe('ACTION_META', () => {
  it('has a plain label for every action', () => {
    for (const a of ACTIONS) expect(ACTION_META[a].label).toMatch(/^[A-Z][a-z]/);
  });
});

describe('awaitsDecision', () => {
  it('is true while a claim is still being worked and false once a decision exists', () => {
    expect(awaitsDecision('UNDER_REVIEW')).toBe(true);
    expect(awaitsDecision('ADJUDICATION')).toBe(true);
    expect(awaitsDecision('INFORMATION_REQUIRED')).toBe(true);
    for (const s of ['APPROVED', 'PARTIALLY_APPROVED', 'DENIED', 'PAYMENT_PENDING', 'PAID', 'CLOSED'] as const) expect(awaitsDecision(s)).toBe(false);
  });
});

describe('briefCta', () => {
  it('offers to open the decision form, with the choice, only at the decision step', () => {
    expect(briefCta('APPROVE', 'ADJUDICATION', 'ADJUSTER')).toEqual({ kind: 'decide', choice: 'APPROVED', label: 'Go to decision' });
    expect(briefCta('PARTIALLY_APPROVE', 'ADJUDICATION', 'ADMIN')).toMatchObject({ kind: 'decide', choice: 'PARTIALLY_APPROVED' });
    expect(briefCta('DENY', 'ADJUDICATION', 'ADJUSTER')).toMatchObject({ kind: 'decide', choice: 'DENIED' });
  });

  it('explains that a decision has to wait for the decision step instead of offering a dead button', () => {
    for (const status of ['UNDER_REVIEW', 'INVESTIGATION', 'APPEALED'] as const) {
      expect(briefCta('APPROVE', status, 'ADJUSTER')).toEqual({ kind: 'hint', text: expect.stringMatching(/decision step/) });
    }
  });

  it('opens the request-information dialog when the status machine allows it', () => {
    for (const status of ['UNDER_REVIEW', 'INVESTIGATION', 'ADJUDICATION'] as const) {
      expect(briefCta('REQUEST_INFO', status, 'ADJUSTER')?.kind).toBe('request_info');
    }
    // Already waiting on the claimant, or not yet in review: the dialog cannot be used.
    expect(briefCta('REQUEST_INFO', 'INFORMATION_REQUIRED', 'ADJUSTER')).toBeNull();
    expect(briefCta('REQUEST_INFO', 'REGISTERED', 'ADJUSTER')).toBeNull();
  });

  it('never lets someone who is not staff request information', () => {
    expect(briefCta('REQUEST_INFO', 'UNDER_REVIEW', 'CLAIMANT')).toBeNull();
  });

  it('only informs for investigate and wait', () => {
    for (const status of ALL_STATUSES) {
      expect(briefCta('INVESTIGATE', status, 'ADJUSTER')).toBeNull();
      expect(briefCta('WAIT', status, 'ADJUSTER')).toBeNull();
    }
  });

  it('offers nothing once a decision has been recorded', () => {
    for (const status of ['APPROVED', 'DENIED', 'PAID', 'CLOSED'] as const) {
      for (const a of ACTIONS) expect(briefCta(a, status, 'ADJUSTER')).toBeNull();
    }
  });
});
