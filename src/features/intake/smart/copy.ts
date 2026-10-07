// Everything Ease says that is written in the browser rather than by the AI: the greeting, what it read from a
// document, a snag. Kept as plain functions so the wording is easy to find, and tested.

import type { ScanResult } from '../../../domain/aiTypes';
import type { DocumentCategory, Role } from '../../../domain/types';
import { formatUSD } from '../../../domain/rulesEngine';
import { parseAmount } from '../aiApply';

export const firstNameOf = (fullName: string) => fullName.replace(/^Dr\.?\s+/i, '').split(/\s+/)[0] || 'there';

export const isProvider = (role: Role) => role === 'PROVIDER';

export function greeting(role: Role, firstName: string): string {
  return isProvider(role)
    ? `Hi ${firstName}, I'm Ease. Tell me about the visit, or drop the itemized bill, and I'll take it from there.`
    : `Hi ${firstName}, I'm Ease. Tell me what happened in your own words, or drop a bill or photo and I'll take it from there.`;
}

export function examples(role: Role): string[] {
  return isProvider(role)
    ? ['We saw a patient today and I have the itemized bill', 'I need to submit a claim for a patient visit']
    : ['I was rear-ended on my way to work', 'Water is leaking through my kitchen ceiling', 'I went to the doctor and I have the bill'];
}

const clipName = (name: string) => (name.length > 34 ? `${name.slice(0, 31)}…` : name);

/** The line the person's side of the chat shows when they drop files in. */
export function attachText(fileNames: string[]): string {
  const names = fileNames.map(clipName);
  if (names.length === 0) return "I've added a file";
  if (names.length === 1) return `I've added ${names[0]}`;
  if (names.length === 2) return `I've added ${names[0]} and ${names[1]}`;
  return `I've added ${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

const NOUNS: Record<DocumentCategory, string> = {
  INVOICE: 'itemized bill',
  RECEIPT: 'receipt',
  REPAIR_ESTIMATE: 'repair estimate',
  POLICE_REPORT: 'police report',
  MEDICAL_RECORD: 'medical record',
  PHOTO: 'photo',
  VIDEO: 'video',
  OTHER: 'document',
};

const joinList = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The total printed on the documents: the stated amount, or the sum of the service lines. */
export function scannedTotal(scan: ScanResult): number | null {
  const stated = scan.fields.find((f) => f.key === 'estimatedAmount');
  const amount = stated ? parseAmount(stated.value) : null;
  if (amount) return amount;
  const sum = scan.serviceLines.reduce((s, l) => s + (l.billedAmount || 0), 0);
  return sum > 0 ? sum : null;
}

/** What Ease says right after it reads something: what it was, the total if there is one, and how much it filled in. */
export function readText(scan: ScanResult, applied: number): string {
  const counts = new Map<string, number>();
  for (const d of scan.documents) counts.set(NOUNS[d.documentType] ?? 'document', (counts.get(NOUNS[d.documentType] ?? 'document') ?? 0) + 1);
  const what = joinList([...counts].map(([noun, n]) => (n === 1 ? noun : `${n} ${noun}s`)));
  const total = scannedTotal(scan);
  const read = what ? `I read your ${what}${total ? ` (${formatUSD(total)})` : ''}.` : 'I read what you sent.';
  if (applied <= 0) return `${read} I couldn't pull anything I could use from it yet.`;
  return `${read} I filled in ${applied} ${applied === 1 ? 'thing' : 'things'}.`;
}

/** Said when a file cannot be read (a video, a Word file, an iPhone HEIC photo) but is kept with the claim. */
export function unreadableText(fileNames: string[]): string {
  const names = joinList(fileNames.map(clipName));
  return fileNames.length === 1 ? `I can't read ${names}, but I've kept it with your claim.` : `I can't read ${names}, but I've kept them with your claim.`;
}

/** An Ease bubble for when a call fails. The person's message stays; they can retry or carry on in the form. */
export function snagText(message: string): string {
  const reason = message.replace(/[.\s]+$/, '') || 'something went wrong';
  return `I hit a snag: ${reason}. You can try again or use the form.`;
}
