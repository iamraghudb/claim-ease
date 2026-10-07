import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../../../services/seed';
import { WELCOME_PERSONAS } from '../content';
import { hasWelcomed, isTourDone, markTourDone, markWelcomed, shouldRedirectToWelcome, tourDoneKey, WELCOMED_KEY, type FlagStorage } from '../flags';
import { HOME_FOR_ROLE } from '../roleHome';

/** A tiny in-memory stand-in for localStorage. */
function memoryStorage(): FlagStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const blocked: FlagStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('welcome flag', () => {
  it('is unset for a first-time visitor and set once they have chosen', () => {
    const s = memoryStorage();
    expect(hasWelcomed(s)).toBe(false);
    markWelcomed(s);
    expect(hasWelcomed(s)).toBe(true);
    expect(s.data.get(WELCOMED_KEY)).toBe('1');
  });

  it('redirects first-time visitors to /welcome, once, and never from /welcome itself', () => {
    const s = memoryStorage();
    expect(shouldRedirectToWelcome('/', s)).toBe(true);
    expect(shouldRedirectToWelcome('/claims/CLM-2026-000103', s)).toBe(true);
    expect(shouldRedirectToWelcome('/welcome', s)).toBe(false);
    markWelcomed(s);
    expect(shouldRedirectToWelcome('/', s)).toBe(false);
  });

  it('survives blocked storage: never throws, and counts as not welcomed', () => {
    expect(() => markWelcomed(blocked)).not.toThrow();
    expect(hasWelcomed(blocked)).toBe(false);
    expect(shouldRedirectToWelcome('/', blocked)).toBe(true);
    expect(() => markTourDone('CLAIMANT', blocked)).not.toThrow();
    expect(isTourDone('CLAIMANT', blocked)).toBe(false);
  });

  it('survives having no storage at all', () => {
    expect(hasWelcomed(null)).toBe(false);
    expect(() => markWelcomed(null)).not.toThrow();
  });
});

describe('tour done flags', () => {
  it('are kept per persona', () => {
    const s = memoryStorage();
    expect(tourDoneKey('ADJUSTER')).toBe('claimease.tourDone.ADJUSTER');
    markTourDone('ADJUSTER', s);
    expect(isTourDone('ADJUSTER', s)).toBe(true);
    expect(isTourDone('ADMIN', s)).toBe(false);
    expect(isTourDone('CLAIMANT', s)).toBe(false);
  });
});

describe('welcome persona cards', () => {
  it('cover all four personas exactly once, in the order the story is told', () => {
    expect(WELCOME_PERSONAS.map((p) => p.role)).toEqual(['CLAIMANT', 'PROVIDER', 'ADJUSTER', 'ADMIN']);
  });

  it('have a name, a story and a description of what the person will see', () => {
    for (const p of WELCOME_PERSONAS) {
      expect(PERSONAS[p.role].name.length).toBeGreaterThan(0);
      expect(p.short.length).toBeGreaterThan(0);
      expect(p.story.length).toBeGreaterThan(0);
      expect(p.sees.length).toBeGreaterThan(0);
      expect(HOME_FOR_ROLE[p.role]).toMatch(/^\//);
    }
  });

  it('send each persona to its own home', () => {
    expect(HOME_FOR_ROLE).toEqual({ CLAIMANT: '/', PROVIDER: '/', ADJUSTER: '/queue', ADMIN: '/admin' });
  });
});
