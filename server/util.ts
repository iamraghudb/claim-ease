// Small helpers shared by the request handlers: validating what the browser sends and
// cleaning up what the model sends back.

import type { Confidence } from '../src/domain/aiTypes';
import { HttpError } from './errors';

export const LIMITS = {
  maxDocuments: 4,
  /** Google accepts about 20 MB of inline data per request; base64 inflates files by a third. */
  maxTotalBase64Chars: 18_000_000,
  maxContextChars: 30_000,
  maxQuestionChars: 500,
  maxHistoryTurns: 8,
};

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** Strips control characters so a file name can never break out of a prompt line. */
export const oneLine = (v: unknown, max: number): string => clip(v, max).replace(/[\u0000-\u001f\u007f]+/g, ' ');
/**
 * Turns code-style names the model sometimes copies from our data (slaAtRisk, fastTrackPct) into plain words,
 * so field names never reach the screen. Words that start with one or two lowercase letters (iPhone, eBay) are left alone.
 */
export const deCamel = (text: string): string =>
  text.replace(/\b([a-z]{3,})((?:[A-Z][a-z0-9]+)+)\b/g, (_m, first: string, rest: string) => {
    const words = [first, ...(rest.match(/[A-Z][a-z0-9]+/g) ?? [])].map((w) => w.toLowerCase());
    if (words[0] === 'sla') words[0] = 'SLA';
    return words.join(' ');
  });
/** `clip`, then plain words: for any text the model writes that a person will read. */
export const plain = (v: unknown, max: number): string => deCamel(clip(v, max));
export const toConfidence = (v: unknown): Confidence => (v === 'high' || v === 'medium' || v === 'low' ? v : 'low');
export const toNumber = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const bad = (message: string) => new HttpError(400, message);

/** Reads `body[key]` as a JSON object, refusing anything missing or oversized. */
export function parseContext<T>(body: unknown, key: string): T {
  if (!isRecord(body) || !isRecord(body[key])) throw bad(`Missing "${key}".`);
  if (JSON.stringify(body[key]).length > LIMITS.maxContextChars) throw new HttpError(413, 'That snapshot is too large.');
  return body[key] as T;
}

/** Wraps untrusted JSON in tags so the model can tell data from instructions. */
export const tagged = (tag: string, value: unknown) => `<${tag}>\n${JSON.stringify(value, null, 1)}\n</${tag}>`;
