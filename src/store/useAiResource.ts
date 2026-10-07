import { useCallback, useEffect, useRef, useState } from 'react';
import { useAiStatus } from './useAiStatus';

// "Smart" AI: things that make a screen feel alive (a claim brief, a status summary) run by themselves
// the first time, and the answer is remembered. Opening the same claim again, in the same state, costs
// nothing and shows up instantly. This keeps us well inside the free tier's limits.

const PREFIX = 'claimease.ai.';
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const memory = new Map<string, { t: number; v: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

/** A short, stable fingerprint of any JSON-able value (not cryptographic: it only names cache entries). */
export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readCache<T>(key: string, maxAgeMs: number): T | undefined {
  const fromMemory = memory.get(key);
  if (fromMemory && Date.now() - fromMemory.t < maxAgeMs) return fromMemory.v as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as { t: number; v: T };
    if (Date.now() - entry.t >= maxAgeMs) return undefined;
    memory.set(key, entry);
    return entry.v;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: unknown) {
  const entry = { t: Date.now(), v: value };
  memory.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* storage full or unavailable: the in-memory copy still works */
  }
}

/** Forget every remembered AI answer (used when sample data is reset). */
export function clearAiCache() {
  memory.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export interface AiResource<T> {
  data: T | undefined;
  loading: boolean;
  error: string;
  /** Ask again, ignoring what was remembered. */
  refresh: () => void;
}

/**
 * Runs an AI call once per distinct input and remembers the answer.
 *  - `namespace` names the kind of answer, `input` is whatever it was computed from (null = do nothing yet).
 *  - Nothing runs when there is no AI server, and demo-mode answers are never mixed up with real ones.
 */
export function useAiResource<T>(namespace: string, input: unknown | null, load: () => Promise<T>, maxAgeMs = DEFAULT_MAX_AGE_MS): AiResource<T> {
  const status = useAiStatus();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<{ key: string; data?: T; loading: boolean; error: string }>({ key: '', loading: false, error: '' });

  const key = status && input !== null ? `${namespace}:${status.configured ? 'ai' : 'demo'}:${fingerprint(input)}` : null;

  const run = useCallback((k: string, force: boolean) => {
    if (!force) {
      const hit = readCache<T>(k, maxAgeMs);
      if (hit !== undefined) {
        setState({ key: k, data: hit, loading: false, error: '' });
        return;
      }
    }
    setState((s) => ({ key: k, data: s.key === k ? s.data : undefined, loading: true, error: '' }));
    const pending = (inFlight.get(k) as Promise<T> | undefined) ?? loadRef.current();
    inFlight.set(k, pending);
    pending
      .then((data) => {
        writeCache(k, data);
        setState((s) => (s.key === k ? { key: k, data, loading: false, error: '' } : s));
      })
      .catch((e: unknown) => setState((s) => (s.key === k ? { key: k, loading: false, error: e instanceof Error ? e.message : 'Something went wrong.' } : s)))
      .finally(() => inFlight.delete(k));
  }, [maxAgeMs]);

  useEffect(() => {
    if (key) run(key, false);
    else setState({ key: '', loading: false, error: '' });
  }, [key, run]);

  const refresh = useCallback(() => {
    if (key) run(key, true);
  }, [key, run]);

  const current = state.key === key;
  return { data: current ? state.data : undefined, loading: key !== null && (!current || state.loading), error: current ? state.error : '', refresh };
}
