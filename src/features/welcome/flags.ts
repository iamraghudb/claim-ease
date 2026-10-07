import type { Role } from '../../domain/types';

// First-run flags. Everything here is best effort: private windows and blocked storage must never break the app,
// so every read and write is guarded and a failure simply means "not seen yet".

export const WELCOMED_KEY = 'claimease.welcomed';
export const TOUR_DONE_PREFIX = 'claimease.tourDone.';

export const tourDoneKey = (role: Role) => `${TOUR_DONE_PREFIX}${role}`;

/** The slice of Storage these helpers need. Passing one in keeps them testable without a browser. */
export type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): FlagStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(key: string, storage: FlagStorage | null): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string, storage: FlagStorage | null) {
  try {
    storage?.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

export function hasWelcomed(storage: FlagStorage | null = browserStorage()): boolean {
  return read(WELCOMED_KEY, storage);
}

export function markWelcomed(storage: FlagStorage | null = browserStorage()) {
  write(WELCOMED_KEY, storage);
}

export function isTourDone(role: Role, storage: FlagStorage | null = browserStorage()): boolean {
  return read(tourDoneKey(role), storage);
}

export function markTourDone(role: Role, storage: FlagStorage | null = browserStorage()) {
  write(tourDoneKey(role), storage);
}

/** True for a first-time visitor who has not seen the welcome screen yet. */
export function shouldRedirectToWelcome(pathname: string, storage: FlagStorage | null = browserStorage()): boolean {
  return pathname !== '/welcome' && !hasWelcomed(storage);
}
