import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAllowedPath } from '../../../domain/aiRoutes';
import type { Role } from '../../../domain/types';
import { tourDoneKey } from '../../welcome/flags';
import { resolveClaimRoute, TOUR_TARGETS, TOURS } from '../steps';
import { useTourStore } from '../tourStore';

const ROLES: Role[] = ['CLAIMANT', 'PROVIDER', 'ADJUSTER', 'ADMIN'];

describe('tour definitions', () => {
  it.each(ROLES)('%s has a tour of 4 to 6 steps', (role) => {
    expect(TOURS[role].length).toBeGreaterThanOrEqual(4);
    expect(TOURS[role].length).toBeLessThanOrEqual(6);
  });

  it.each(ROLES)('%s: every step route is a page that persona can open', (role) => {
    for (const step of TOURS[role]) {
      if (step.route) expect(isAllowedPath(role, step.route), `${role} ${step.id} -> ${step.route}`).toBe(true);
    }
  });

  it.each(ROLES)('%s: every target is a known anchor', (role) => {
    for (const step of TOURS[role]) {
      if (step.target) expect(TOUR_TARGETS as readonly string[], `${role} ${step.id}`).toContain(step.target);
    }
  });

  it.each(ROLES)('%s: steps have unique ids, a title and a body in plain text', (role) => {
    const ids = TOURS[role].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOURS[role]) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
      // Ease's voice: no emoji.
      expect(`${s.title} ${s.body}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('follows the agreed anchors for each persona', () => {
    const targets = (role: Role) => TOURS[role].map((s) => s.target);
    expect(targets('CLAIMANT')).toEqual(['start-claim', 'claims-nav', 'claim-timeline', 'ease-summary', 'ease-launcher', 'persona-menu']);
    expect(targets('PROVIDER')).toEqual(['start-claim', 'file-choice', 'claims-nav', 'ease-launcher', 'persona-menu']);
    expect(targets('ADJUSTER')).toEqual(['queue-tiles', 'queue-table', 'ai-brief', 'actions-rail', 'ease-launcher', 'persona-menu']);
    expect(targets('ADMIN')).toEqual(['kpis', 'ai-insights', 'rules-config', 'ease-launcher', 'persona-menu']);
  });

  it('opens the agreed seeded claims', () => {
    expect(TOURS.CLAIMANT.find((s) => s.target === 'claim-timeline')?.route).toBe('/claims/CLM-2026-000103');
    expect(TOURS.ADJUSTER.find((s) => s.target === 'ai-brief')?.route).toBe('/queue/CLM-2026-000105');
    expect(TOURS.PROVIDER.find((s) => s.target === 'file-choice')?.route).toBe('/file');
  });
});

describe('resolveClaimRoute', () => {
  it('keeps a route whose claim exists', () => {
    expect(resolveClaimRoute('/claims/CLM-2026-000103', ['CLM-2026-000103'])).toBe('/claims/CLM-2026-000103');
  });

  it('follows the sequence number when the year has moved on', () => {
    expect(resolveClaimRoute('/claims/CLM-2026-000103', ['CLM-2027-000102', 'CLM-2027-000103'])).toBe('/claims/CLM-2027-000103');
    expect(resolveClaimRoute('/queue/CLM-2026-000105', ['CLM-2027-000105'])).toBe('/queue/CLM-2027-000105');
  });

  it('leaves other routes, and unknown claims, alone', () => {
    expect(resolveClaimRoute('/queue', ['CLM-2026-000103'])).toBe('/queue');
    expect(resolveClaimRoute('/claims/CLM-2026-000103', [])).toBe('/claims/CLM-2026-000103');
  });
});

describe('tour store', () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) });
    useTourStore.getState().skip();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    useTourStore.getState().skip();
  });

  const state = () => useTourStore.getState();

  it('is idle until started', () => {
    expect(state().active).toBe(false);
    expect(state().steps).toEqual([]);
    state().next();
    expect(state().active).toBe(false);
  });

  it('start opens the persona tour at its first step', () => {
    state().start('ADJUSTER');
    expect(state().active).toBe(true);
    expect(state().role).toBe('ADJUSTER');
    expect(state().index).toBe(0);
    expect(state().steps).toBe(TOURS.ADJUSTER);
  });

  it('next and back move one step and stop at the first step', () => {
    state().start('CLAIMANT');
    state().back();
    expect(state().index).toBe(0);
    state().next();
    state().next();
    expect(state().index).toBe(2);
    state().back();
    expect(state().index).toBe(1);
    expect(state().active).toBe(true);
  });

  it('next on the last step finishes the tour and remembers it for that persona only', () => {
    state().start('ADMIN');
    const last = TOURS.ADMIN.length - 1;
    for (let i = 0; i < last; i++) state().next();
    expect(state().index).toBe(last);
    expect(state().active).toBe(true);
    state().next();
    expect(state().active).toBe(false);
    expect(state().index).toBe(0);
    expect(saved.get(tourDoneKey('ADMIN'))).toBe('1');
    expect(saved.has(tourDoneKey('CLAIMANT'))).toBe(false);
  });

  it('skip ends the tour without marking it done', () => {
    state().start('PROVIDER');
    state().next();
    state().skip();
    expect(state().active).toBe(false);
    expect(state().steps).toEqual([]);
    expect(saved.size).toBe(0);
  });

  it('start again begins from the top, even mid-tour', () => {
    state().start('CLAIMANT');
    state().next();
    state().next();
    state().start('CLAIMANT');
    expect(state().index).toBe(0);
    expect(state().active).toBe(true);
  });

  it('finishes quietly when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    state().start('ADJUSTER');
    for (let i = 0; i < TOURS.ADJUSTER.length; i++) expect(() => state().next()).not.toThrow();
    expect(state().active).toBe(false);
  });
});
