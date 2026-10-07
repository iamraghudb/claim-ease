// Turns an AI scan result into proposed changes to the intake form, and applies the ones the user ticks.
// Pure functions (no React, no network), so they are easy to test.
//
// Ground rules:
//  - The AI only ever PROPOSES. Nothing touches the form until the user presses Apply.
//  - Values the user already typed are never overwritten silently: they show up as conflicts, unticked.
//  - Low-confidence values are unticked by default, and when applied they are flagged "estimated".
//  - The date of loss/service is not applied: it drives the policy check in step 1, so it is only compared.

import type { Confidence, ExtractedLine, ExtractKey, ScanResult } from '../../domain/aiTypes';
import { DIAGNOSES, PROCEDURES, US_STATES } from '../../domain/catalog';
import type { ClaimType } from '../../domain/types';
import { toggleEstimated, type IntakeDraft } from './draft';

export interface ProposedChange {
  /** The field key, or `line:<n>` for a service line. */
  id: string;
  label: string;
  /** Human-readable value that will be written. */
  value: string;
  confidence: Confidence;
  evidence: string;
  /** What the form holds now, when that is different from `value`. */
  current?: string;
  /** Problem that prevents applying (e.g. the patient is not a member of this plan). */
  blocked?: string;
  /** Heads-up that does not prevent applying. */
  note?: string;
  defaultOn: boolean;
}

export type WriteResult = { draft: IntakeDraft } | { problem: string };

export interface Adapter {
  label: string;
  claimTypes: ClaimType[];
  /** What the form currently holds for this value ('' when empty). */
  read(d: IntakeDraft): string;
  write(d: IntakeDraft, value: string): WriteResult;
  /** When the AI is unsure, apply the value and tick "Estimated / unsure" for this form field. */
  estimatedKey?: string;
}

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** "Lopez, Maria" and "Maria Lopez" compare equal. */
const nameKey = (s: string) => norm(s.replace(/[,.]/g, ' ')).split(' ').sort().join(' ');
const ok = (draft: IntakeDraft): WriteResult => ({ draft });
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function parseAmount(v: string): number | null {
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The plan member a name or ID refers to. Only works once the policy has been looked up (it holds the members). */
export function memberMatch(d: IntakeDraft, by: { name?: string; id?: string }) {
  const members = d.policy?.members ?? [];
  return members.find((m) => (by.id && norm(m.memberId) === norm(by.id)) || (by.name && nameKey(m.name) === nameKey(by.name)));
}

export function selectMember(d: IntakeDraft, m: { memberId: string; name: string; dob: string }): WriteResult {
  return ok({ ...d, health: { ...d.health, memberId: m.memberId, patientName: m.name, patientDob: m.dob } });
}

const A = (a: Adapter): Adapter => a;

/** One entry per form value a scan (or Smart start) may fill. Shared by the document scan and the conversation. */
export const ADAPTERS: Partial<Record<ExtractKey, Adapter>> = {
  description: A({
    label: 'Description',
    claimTypes: ['AUTO', 'PROPERTY', 'HEALTH'],
    read: (d) => d.incidentDescription,
    write: (d, v) => ok({ ...d, incidentDescription: v }),
  }),
  estimatedAmount: A({
    label: 'Estimated amount',
    claimTypes: ['AUTO', 'PROPERTY'], // health totals come from the service lines
    read: (d) => d.estimatedAmount,
    write: (d, v) => {
      const n = parseAmount(v);
      return n === null ? { problem: `"${v}" is not a valid amount` } : ok({ ...d, estimatedAmount: String(n) });
    },
    estimatedKey: 'estimatedAmount',
  }),
  city: A({
    label: 'City',
    claimTypes: ['AUTO', 'PROPERTY', 'HEALTH'],
    read: (d) => d.location.city,
    write: (d, v) => ok({ ...d, location: { ...d.location, city: v } }),
  }),
  state: A({
    label: 'State',
    claimTypes: ['AUTO', 'PROPERTY', 'HEALTH'],
    read: (d) => d.location.state,
    write: (d, v) => {
      const code = v.toUpperCase();
      return US_STATES.includes(code) ? ok({ ...d, location: { ...d.location, state: code } }) : { problem: `"${v}" is not a US state code` };
    },
  }),

  // ----- health -----
  patientName: A({
    label: 'Patient',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.patientName,
    write: (d, v) => {
      const m = memberMatch(d, { name: v });
      return m ? selectMember(d, m) : { problem: `"${v}" is not a member of this plan, so the claim cannot be filed for them` };
    },
  }),
  memberId: A({
    label: 'Member ID',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.memberId,
    write: (d, v) => {
      const m = memberMatch(d, { id: v });
      return m ? selectMember(d, m) : { problem: `Member ID ${v} is not on this plan` };
    },
  }),
  patientDob: A({
    label: 'Date of birth',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.patientDob,
    write: (d, v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? ok({ ...d, health: { ...d.health, patientDob: v } }) : { problem: `"${v}" is not a valid date` }),
  }),
  providerName: A({
    label: 'Provider',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.provider.name,
    write: (d, v) => ok({ ...d, health: { ...d.health, provider: { ...d.health.provider, name: v } } }),
  }),
  providerNpi: A({
    label: 'Provider NPI',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.provider.npi,
    write: (d, v) => {
      const digits = v.replace(/\D/g, '');
      return digits.length === 10 ? ok({ ...d, health: { ...d.health, provider: { ...d.health.provider, npi: digits } } }) : { problem: 'An NPI has exactly 10 digits' };
    },
  }),
  providerTaxId: A({
    label: 'Provider tax ID',
    claimTypes: ['HEALTH'],
    read: (d) => d.health.provider.taxId,
    write: (d, v) => ok({ ...d, health: { ...d.health, provider: { ...d.health.provider, taxId: v } } }),
  }),

  // ----- auto -----
  vehicleYear: A({
    label: 'Vehicle year',
    claimTypes: ['AUTO'],
    read: (d) => String(d.auto.vehicle.year ?? ''),
    write: (d, v) => {
      const year = Number.parseInt(v, 10);
      return year >= 1980 && year <= 2100 ? ok({ ...d, auto: { ...d.auto, vehicle: { ...d.auto.vehicle, year } } }) : { problem: `"${v}" is not a valid model year` };
    },
  }),
  vehicleMake: A({
    label: 'Vehicle make',
    claimTypes: ['AUTO'],
    read: (d) => d.auto.vehicle.make,
    write: (d, v) => ok({ ...d, auto: { ...d.auto, vehicle: { ...d.auto.vehicle, make: v } } }),
  }),
  vehicleModel: A({
    label: 'Vehicle model',
    claimTypes: ['AUTO'],
    read: (d) => d.auto.vehicle.model,
    write: (d, v) => ok({ ...d, auto: { ...d.auto, vehicle: { ...d.auto.vehicle, model: v } } }),
  }),
  vehicleVin: A({
    label: 'VIN',
    claimTypes: ['AUTO'],
    read: (d) => d.auto.vehicle.vin ?? '',
    write: (d, v) => {
      const vin = v.replace(/\s/g, '').toUpperCase();
      return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? ok({ ...d, auto: { ...d.auto, vehicle: { ...d.auto.vehicle, vin } } }) : { problem: 'A VIN has 17 letters and digits' };
    },
  }),
  vehicleDamage: A({
    label: 'Vehicle damage',
    claimTypes: ['AUTO'],
    read: (d) => d.auto.vehicle.damage,
    write: (d, v) => ok({ ...d, auto: { ...d.auto, vehicle: { ...d.auto.vehicle, damage: v } } }),
    estimatedKey: 'vehicleDamage',
  }),
  policeReportNumber: A({
    label: 'Police report #',
    claimTypes: ['AUTO'],
    read: (d) => d.auto.policeReportNumber ?? '',
    write: (d, v) => ok({ ...d, auto: { ...d.auto, policeReportNumber: v } }),
  }),

  // ----- property -----
  propertyAddress: A({
    label: 'Property address',
    claimTypes: ['PROPERTY'],
    read: (d) => d.property.propertyAddress,
    write: (d, v) => ok({ ...d, property: { ...d.property, propertyAddress: v } }),
  }),
  areasAffected: A({
    label: 'Areas affected',
    claimTypes: ['PROPERTY'],
    read: (d) => d.property.areasAffected,
    write: (d, v) => ok({ ...d, property: { ...d.property, areasAffected: v } }),
    estimatedKey: 'areasAffected',
  }),
  contractorName: A({
    label: 'Contractor',
    claimTypes: ['PROPERTY'],
    read: (d) => d.property.contractorName ?? '',
    write: (d, v) => ok({ ...d, property: { ...d.property, contractorName: v } }),
  }),
  itemsStolenOrDamaged: A({
    label: 'Items stolen or damaged',
    claimTypes: ['PROPERTY'],
    read: (d) => d.property.itemsStolenOrDamaged ?? '',
    write: (d, v) => ok({ ...d, property: { ...d.property, itemsStolenOrDamaged: v } }),
    estimatedKey: 'itemsStolenOrDamaged',
  }),
};

// ---------- service lines (health) ----------

const lineIsEmpty = (l: IntakeDraft['health']['lines'][number]) => !l.procedureCode && !l.diagnosisCode && !(l.billedAmount > 0);
const knownProcedure = (code: string) => PROCEDURES.some((p) => p.code === code);
const knownDiagnosis = (code: string) => DIAGNOSES.some((x) => x.code === code);

function proposeLine(d: IntakeDraft, l: ExtractedLine, index: number): ProposedChange | null {
  // Already on the form (same code and amount): nothing to propose.
  if (d.health.lines.some((x) => x.procedureCode && x.procedureCode === l.procedureCode && Math.abs(x.billedAmount - l.billedAmount) < 0.005)) return null;
  const notes: string[] = [];
  if (l.procedureCode && !knownProcedure(l.procedureCode)) notes.push(`Procedure ${l.procedureCode} is not in this demo's fee schedule: pick the closest one yourself.`);
  if (l.diagnosisCode && !knownDiagnosis(l.diagnosisCode)) notes.push(`Diagnosis ${l.diagnosisCode} is not in this demo's list: pick it yourself.`);
  if (!l.procedureCode) notes.push('No procedure code was printed on the document.');
  return {
    id: `line:${index}`,
    label: `Service line: ${l.procedureCode || 'no code'}${l.diagnosisCode ? ` · ${l.diagnosisCode}` : ''}`,
    value: `${l.description || 'Service'} · ${l.units} unit${l.units === 1 ? '' : 's'} · ${money(l.billedAmount)}`,
    confidence: l.confidence,
    evidence: 'Itemized lines',
    note: notes.join(' ') || undefined,
    defaultOn: l.confidence !== 'low',
  };
}

function writeLine(d: IntakeDraft, l: ExtractedLine): IntakeDraft {
  const next = {
    procedureCode: knownProcedure(l.procedureCode) ? l.procedureCode : '',
    diagnosisCode: knownDiagnosis(l.diagnosisCode) ? l.diagnosisCode : '',
    units: Math.max(1, l.units),
    billedAmount: l.billedAmount,
  };
  const lines = d.health.lines;
  const empty = lines.findIndex(lineIsEmpty);
  return { ...d, health: { ...d.health, lines: empty >= 0 ? lines.map((x, i) => (i === empty ? next : x)) : [...lines, next] } };
}

// ---------- public API ----------

export function proposeChanges(draft: IntakeDraft, scan: ScanResult): ProposedChange[] {
  const out: ProposedChange[] = [];
  for (const f of scan.fields) {
    const adapter = ADAPTERS[f.key];
    if (!adapter || !adapter.claimTypes.includes(draft.claimType)) continue;
    const current = adapter.read(draft);
    if (norm(current) === norm(f.value)) continue; // the form already says this
    const result = adapter.write(draft, f.value);
    const blocked = 'problem' in result ? result.problem : undefined;
    out.push({
      id: f.key,
      label: f.key === 'description' && draft.claimType === 'HEALTH' ? 'Clinical summary' : adapter.label,
      value: f.value,
      confidence: f.confidence,
      evidence: f.evidence,
      current: current || undefined,
      blocked,
      defaultOn: !blocked && f.confidence !== 'low' && current === '',
    });
  }
  if (draft.claimType === 'HEALTH')
    scan.serviceLines.forEach((l, i) => {
      const p = proposeLine(draft, l, i);
      if (p) out.push(p);
    });
  return out;
}

export function defaultSelection(proposals: ProposedChange[]): Set<string> {
  return new Set(proposals.filter((p) => p.defaultOn).map((p) => p.id));
}

export function applyChanges(draft: IntakeDraft, scan: ScanResult, selected: Set<string>): { draft: IntakeDraft; applied: number; labels: string[]; keys: string[] } {
  let next = draft;
  let applied = 0;
  const labels: string[] = [];
  /** The ids (field keys, or `line:<n>`) that were actually written. */
  const keys: string[] = [];
  for (const p of proposeChanges(draft, scan)) {
    if (!selected.has(p.id) || p.blocked) continue;
    if (p.id.startsWith('line:')) {
      next = writeLine(next, scan.serviceLines[Number(p.id.slice(5))]);
      applied++;
      labels.push(p.label);
      keys.push(p.id);
      continue;
    }
    const key = p.id as ExtractKey;
    const adapter = ADAPTERS[key];
    const result = adapter?.write(next, p.value);
    if (!adapter || !result || 'problem' in result) continue;
    next = result.draft;
    if (p.confidence === 'low' && adapter.estimatedKey) next = toggleEstimated(next, adapter.estimatedKey, true);
    applied++;
    labels.push(p.label);
    keys.push(p.id);
  }
  return { draft: next, applied, labels, keys };
}

/** After a scan, label each uploaded file with the type the AI recognised (so the checklist ticks). */
export function labelDocuments(draft: IntakeDraft, scan: ScanResult): { draft: IntakeDraft; relabeled: { fileName: string; to: string }[] } {
  const relabeled: { fileName: string; to: string }[] = [];
  const documents = draft.documents.map((doc) => {
    const seen = scan.documents.find((s) => s.fileName === doc.fileName);
    if (!seen || seen.documentType === 'OTHER' || seen.documentType === doc.category) return doc;
    relabeled.push({ fileName: doc.fileName, to: seen.documentType });
    return { ...doc, category: seen.documentType };
  });
  return { draft: { ...draft, documents }, relabeled };
}

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Cross-checks between what the documents say and what the user entered. Plain rules, no AI. */
export function reviewNotes(draft: IntakeDraft, scan: ScanResult): string[] {
  const notes: string[] = [];
  const documentDate = scan.fields.find((f) => f.key === 'dateOfLoss')?.value;
  if (documentDate && /^\d{4}-\d{2}-\d{2}$/.test(documentDate) && draft.dateOfLoss && documentDate !== draft.dateOfLoss) {
    const what = draft.claimType === 'HEALTH' ? 'date of service' : 'date of loss';
    notes.push(`The document shows ${fmtDate(documentDate)} but you entered ${fmtDate(draft.dateOfLoss)} as the ${what}. Go back to step 1 if the document is right, because the policy check used your date.`);
  }
  if (draft.claimType === 'HEALTH' && scan.serviceLines.length) {
    const total = scan.fields.find((f) => f.key === 'estimatedAmount');
    const printed = total ? parseAmount(total.value) : null;
    const sum = scan.serviceLines.reduce((s, l) => s + l.billedAmount, 0);
    if (printed !== null && Math.abs(printed - sum) > 0.01) notes.push(`The line items add up to ${money(sum)} but the document total says ${money(printed)}.`);
  }
  return notes;
}
