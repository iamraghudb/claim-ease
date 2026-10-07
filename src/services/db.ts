import { buildSeed, type Database } from './seed';

// In-memory "database" with best-effort localStorage persistence so a demo
// survives a page refresh. Replace this module (and the services that use it)
// with HTTP calls to swap in a real backend.

const STORAGE_KEY = 'claimease.db.v1';
let db: Database | null = null;

function load(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Database;
  } catch {
    /* storage unavailable or corrupt — fall back to seed */
  }
  return buildSeed();
}

export function getDb(): Database {
  if (!db) db = load();
  return db;
}

export function persist(): void {
  if (!db) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Quota exceeded (e.g. large image previews): drop previews and retry once.
    try {
      const slim: Database = {
        ...db,
        claims: db.claims.map((c) => ({
          ...c,
          documents: c.documents.map((d) => (d.previewUrl?.startsWith('data:image/svg') ? d : { ...d, previewUrl: undefined })),
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      /* give up silently: in-memory state still works */
    }
  }
}

export function resetDb(): void {
  db = buildSeed();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  persist();
}

/** Simulated network latency. */
export function delay<T>(value: T, ms = 60 + Math.random() * 90): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'VALIDATION' | 'FORBIDDEN' | 'CONFLICT' = 'VALIDATION',
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
