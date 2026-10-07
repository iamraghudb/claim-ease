// The pure logic behind Smart start ("tell Ease what happened"): turns what a conversation, a dropped bill and a
// policy lookup learn into the claim draft, and turns the draft back into the facts Ease is told it already knows.
// No React and no network (the policy lookup is passed in), so all of it is unit-tested.
//
// Ground rules, same spirit as aiApply.ts:
//  - Never throw on a bad value: skip it. The server already validates, this is the second line of defence.
//  - Later facts overwrite earlier ones: people correct themselves mid-conversation.
//  - A low-confidence value is flagged "estimated" wherever the form can show that, and a document never
//    overwrites something the person said.

import { INTAKE_KEYS, type AiSource, type IntakeField, type IntakeKey, type IntakePolicy, type ScanResult } from '../../domain/aiTypes';
import { AUTO_INCIDENT_TYPES, POLICY_TO_CLAIM_TYPE, PROPERTY_DAMAGE_TYPES } from '../../domain/catalog';
import { isValidPolicyNumber, normalizePolicyNumber } from '../../domain/claimNumber';
import type { ClaimType, Customer, OtherParty, Policy, Role } from '../../domain/types';
import { formatDate } from '../../components/format';
import { ADAPTERS, applyChanges, labelDocuments, memberMatch, proposeChanges, selectMember } from './aiApply';
import { applyPolicy, draftAmount, emptyDraft, toggleEstimated, type IntakeDraft, type StoredScan } from './draft';

export interface IntakeCtx {
  role: Role;
  /** Today as YYYY-MM-DD. A date of loss after today is never accepted. */
  today: string;
  /** The person's own active policies (what Ease was told). Empty for a provider, who types a plan number. */
  policies: IntakePolicy[];
}

// ---------- small helpers ----------

const has = (d: IntakeDraft, key: string) => !!d.captured?.includes(key);

function addCaptured(d: IntakeDraft, ...keys: string[]): IntakeDraft {
  const set = new Set(d.captured ?? []);
  const before = set.size;
  for (const k of keys) set.add(k);
  return set.size === before && d.captured ? d : { ...d, captured: [...set] };
}

const yesNo = (v: string): boolean | null => (/^(yes|y|true)$/i.test(v.trim()) ? true : /^(no|n|false)$/i.test(v.trim()) ? false : null);

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-31). */
export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, day));
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === day;
}

const setEstimated = (d: IntakeDraft, key: string, confidence: IntakeField['confidence']) => toggleEstimated(d, key, confidence === 'low');

/** A new conversation: a provider's claim is always a health claim, so that is known from the start. */
export function startDraft(role: Role): IntakeDraft {
  const d = emptyDraft(role);
  return role === 'PROVIDER' ? { ...d, captured: ['claimType'] } : d;
}

// ---------- the person's policies, as Ease is told about them ----------

/** The person's ACTIVE policies with a plain label Ease can say out loud, e.g. "Auto, Toyota RAV4". */
export function intakePolicies(policies: Policy[], customerId: string | undefined): IntakePolicy[] {
  return policies
    .filter((p) => p.status === 'ACTIVE' && !!customerId && p.customerId === customerId)
    .map((p) => {
      const car = p.vehicles?.[0];
      const label =
        p.type === 'AUTO'
          ? car
            ? `Auto, ${car.make} ${car.model}`
            : 'Auto'
          : p.type === 'HOME'
            ? p.propertyAddress
              ? `Home, ${p.propertyAddress}`
              : 'Home'
            : p.type === 'RENTERS'
              ? p.propertyAddress
                ? `Renters, ${p.propertyAddress}`
                : 'Renters'
              : 'Health plan';
      return { policyNumber: p.policyNumber, type: p.type, label };
    });
}

// ---------- draft -> what Ease already knows ----------

/**
 * The draft mapped back to INTAKE keys, so Ease never asks for something it already has. The form's own defaults
 * (drivable, nobody hurt, livable...) are only reported once a conversation has actually captured them.
 */
export function intakeKnown(d: IntakeDraft): Record<string, string> {
  const k: Record<string, string> = {};
  const put = (key: string, v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (s) k[key] = s;
  };
  const yn = (key: string, v: boolean) => {
    if (has(d, key)) k[key] = v ? 'yes' : 'no';
  };

  put('policyNumber', d.policyNumber);
  // The policy fixes the kind of claim. Before a policy, only say so once it has been worked out.
  if (d.policy || has(d, 'claimType')) put('claimType', d.claimType);
  put('dateOfLoss', d.dateOfLoss);
  // A city and state from the policy's address are not "where it happened", so they only count once someone said so.
  if (has(d, 'city')) put('city', d.location.city);
  if (has(d, 'state')) put('state', d.location.state);
  put('description', d.incidentDescription);

  if (d.claimType === 'AUTO') {
    const a = d.auto;
    put('estimatedAmount', d.estimatedAmount);
    put('vehicleYear', a.vehicle.year);
    put('vehicleMake', a.vehicle.make);
    put('vehicleModel', a.vehicle.model);
    put('vehicleDamage', a.vehicle.damage);
    put('policeReportNumber', a.policeReportNumber);
    if (has(d, 'incidentType')) put('incidentType', a.incidentType);
    yn('drivable', a.drivable);
    yn('injuries', a.injuries);
    yn('hasOtherParty', a.otherParties.length > 0);
  } else if (d.claimType === 'PROPERTY') {
    const p = d.property;
    put('estimatedAmount', d.estimatedAmount);
    put('propertyAddress', p.propertyAddress);
    put('areasAffected', p.areasAffected);
    put('itemsStolenOrDamaged', p.itemsStolenOrDamaged);
    put('contractorName', p.contractorName);
    if (has(d, 'damageType')) put('damageType', p.damageType);
    yn('habitable', p.habitable);
  } else {
    const h = d.health;
    const total = draftAmount(d);
    if (total > 0) put('estimatedAmount', total);
    put('patientName', h.patientName);
    if (has(d, 'providerName')) put('providerName', h.provider.name);
  }
  return k;
}

// ---------- conversation facts -> draft ----------

const KEY_KIND: Partial<Record<IntakeKey, ClaimType>> = {
  vehicleYear: 'AUTO',
  vehicleMake: 'AUTO',
  vehicleModel: 'AUTO',
  vehicleVin: 'AUTO',
  vehicleDamage: 'AUTO',
  policeReportNumber: 'AUTO',
  incidentType: 'AUTO',
  drivable: 'AUTO',
  injuries: 'AUTO',
  hasOtherParty: 'AUTO',
  propertyAddress: 'PROPERTY',
  areasAffected: 'PROPERTY',
  contractorName: 'PROPERTY',
  itemsStolenOrDamaged: 'PROPERTY',
  damageType: 'PROPERTY',
  habitable: 'PROPERTY',
  patientName: 'HEALTH',
  patientDob: 'HEALTH',
  memberId: 'HEALTH',
  providerName: 'HEALTH',
  providerNpi: 'HEALTH',
  providerTaxId: 'HEALTH',
};

/** A policy number Ease may use: well formed and, when the person has policies, one of theirs. */
function acceptPolicyNumber(raw: string, ctx: IntakeCtx): string | null {
  const n = normalizePolicyNumber(raw);
  if (!isValidPolicyNumber(n)) return null;
  if (ctx.policies.length > 0 && !ctx.policies.some((p) => p.policyNumber === n)) return null;
  return n;
}

/** The kind of claim these facts point to, or undefined while it is still open. */
function resolveKind(d: IntakeDraft, fields: IntakeField[], ctx: IntakeCtx): ClaimType | undefined {
  if (ctx.role === 'PROVIDER') return 'HEALTH';
  // A policy fixes the kind of claim: auto -> auto, home/renters -> property, health -> health.
  const given = [...fields].reverse().find((f) => f.key === 'policyNumber');
  const number = given ? acceptPolicyNumber(given.value, ctx) : null;
  const named = number ? ctx.policies.find((p) => p.policyNumber === number) : undefined;
  if (named) return POLICY_TO_CLAIM_TYPE[named.type];
  if (d.policy || has(d, 'claimType')) return d.claimType;
  const kinds = new Set(fields.map((f) => KEY_KIND[f.key]).filter(Boolean));
  return kinds.size === 1 ? ([...kinds][0] as ClaimType) : undefined;
}

const isPlaceholderParty = (p: OtherParty) => p.name === 'Unknown' && p.atFault === 'UNKNOWN' && !p.phone && !p.insurer && !p.policyNumber && !p.vehicle;

/** Returns the new draft, or null when the value does not apply (so the caller skips it). */
function applyField(d: IntakeDraft, f: IntakeField, kind: ClaimType, ctx: IntakeCtx): IntakeDraft | null {
  const v = f.value.trim();
  switch (f.key) {
    case 'policyNumber': {
      const n = acceptPolicyNumber(v, ctx);
      if (!n) return null;
      // A different policy has to be looked up again.
      return n === d.policyNumber ? d : { ...d, policyNumber: n, policy: undefined, customer: undefined };
    }
    case 'dateOfLoss': {
      if (!isRealDate(v) || v > ctx.today) return null;
      const next = v === d.dateOfLoss ? d : { ...d, dateOfLoss: v, policy: undefined, customer: undefined };
      // A provider's date of service has no "not sure" box on the form, so only people flag it.
      return ctx.role === 'PROVIDER' ? next : setEstimated(next, 'dateOfLoss', f.confidence);
    }
    case 'incidentType': {
      const t = AUTO_INCIDENT_TYPES.find((x) => x.value === v.toUpperCase());
      return t && kind === 'AUTO' ? { ...d, auto: { ...d.auto, incidentType: t.value } } : null;
    }
    case 'damageType': {
      const t = PROPERTY_DAMAGE_TYPES.find((x) => x.value === v.toUpperCase());
      return t && kind === 'PROPERTY' ? { ...d, property: { ...d.property, damageType: t.value } } : null;
    }
    case 'drivable':
    case 'injuries': {
      const yes = yesNo(v);
      return yes === null || kind !== 'AUTO' ? null : { ...d, auto: { ...d.auto, [f.key]: yes } };
    }
    case 'habitable': {
      const yes = yesNo(v);
      return yes === null || kind !== 'PROPERTY' ? null : { ...d, property: { ...d.property, habitable: yes } };
    }
    case 'hasOtherParty': {
      const yes = yesNo(v);
      if (yes === null || kind !== 'AUTO') return null;
      const parties = d.auto.otherParties;
      // "Yes" adds a placeholder to fill in later; "no" only removes a placeholder, never a party the person described.
      const otherParties = yes ? (parties.length ? parties : [{ name: 'Unknown', atFault: 'UNKNOWN' } satisfies OtherParty]) : parties.filter((p) => !isPlaceholderParty(p));
      return { ...d, auto: { ...d.auto, otherParties } };
    }
    case 'patientName': {
      if (kind !== 'HEALTH') return null;
      // Matched to a plan member when the plan is known; otherwise kept as typed and matched once it is.
      const m = memberMatch(d, { name: v });
      if (m) {
        const r = selectMember(d, m);
        return 'draft' in r ? r.draft : d;
      }
      return { ...d, health: { ...d.health, patientName: v } };
    }
    default: {
      const adapter = ADAPTERS[f.key as keyof typeof ADAPTERS];
      if (!adapter || !adapter.claimTypes.includes(kind)) return null;
      const r = adapter.write(d, v);
      if ('problem' in r) return null;
      return adapter.estimatedKey ? setEstimated(r.draft, adapter.estimatedKey, f.confidence) : r.draft;
    }
  }
}

/**
 * Applies what the conversation just learned. Facts arrive from the server already validated; this checks them
 * again against the form's own rules, and skips (never throws on) anything that does not fit.
 */
export function applyIntakeFields(draft: IntakeDraft, fields: IntakeField[], ctx: IntakeCtx): IntakeDraft {
  const usable = fields
    .filter((f) => f && typeof f.value === 'string' && f.value.trim() !== '' && (INTAKE_KEYS as readonly string[]).includes(f.key))
    .map((f) => ({ ...f, value: f.value.trim() }));
  let d = draft;
  const kind = resolveKind(d, usable, ctx);
  if (kind) d = addCaptured(kind === d.claimType ? d : { ...d, claimType: kind }, 'claimType');
  for (const f of usable) {
    try {
      const next = applyField(d, f, kind ?? d.claimType, ctx);
      if (next) d = addCaptured(next, f.key);
    } catch {
      /* a value we could not use is skipped */
    }
  }
  return d;
}

// ---------- a dropped bill or photo -> draft ----------

export interface ApplyOutcome {
  draft: IntakeDraft;
  /** How many things were filled in. */
  applied: number;
  /** Friendly names of what was filled in. */
  labels: string[];
}

/** Service lines become one label, so the Details step does not list a pill per line. */
function friendlyLabels(labels: string[]): string[] {
  const lines = labels.filter((l) => l.startsWith('Service line'));
  const rest = labels.filter((l) => !l.startsWith('Service line'));
  return lines.length ? [...rest, lines.length === 1 ? 'Service line' : `Service lines (${lines.length})`] : rest;
}

function withLabels(d: IntakeDraft, labels: string[]): IntakeDraft {
  if (!d.scan || labels.length === 0) return d;
  return { ...d, scan: { ...d.scan, appliedLabels: [...new Set([...(d.scan.appliedLabels ?? []), ...friendlyLabels(labels)])] } };
}

/**
 * Applies what a scan found, same safety as the form's own scan panel: never overwrite something already there,
 * never apply a value the form rejects. A low-confidence value is only used where the form can flag it "not sure".
 */
function applyProposals(d: IntakeDraft, scan: ScanResult): ApplyOutcome {
  const selected = new Set(
    proposeChanges(d, scan)
      .filter((p) => {
        if (p.blocked) return false;
        if (p.id.startsWith('line:')) return p.defaultOn;
        const flaggable = !!ADAPTERS[p.id as keyof typeof ADAPTERS]?.estimatedKey;
        return p.current === undefined && (p.confidence !== 'low' || flaggable);
      })
      .map((p) => p.id),
  );
  const r = applyChanges(d, scan, selected);
  return { draft: addCaptured(r.draft, ...r.keys.filter((k) => !k.startsWith('line:'))), applied: r.applied, labels: r.labels };
}

function mergeScan(prev: StoredScan | undefined, scan: ScanResult): StoredScan {
  const earlier = prev?.documents.filter((p) => !scan.documents.some((n) => n.fileName === p.fileName)) ?? [];
  return { ...scan, id: String(Date.now()), applied: true, appliedLabels: prev?.appliedLabels ?? [], documents: [...earlier, ...scan.documents] };
}

/**
 * Puts a scan on the draft: labels the files, settles the kind of claim (and the policy, when exactly one of the
 * person's policies fits), fills in what the documents say, and takes the date from the document when none was given.
 */
export function applyScanToDraft(draft: IntakeDraft, scan: ScanResult, ctx: IntakeCtx): ApplyOutcome {
  let d = labelDocuments(draft, scan).draft;

  if (ctx.role !== 'PROVIDER' && !d.policy && !d.policyNumber && !has(d, 'claimType') && scan.claimTypeGuess) {
    const guess = scan.claimTypeGuess;
    d = addCaptured({ ...d, claimType: guess }, 'claimType');
    const fits = ctx.policies.filter((p) => POLICY_TO_CLAIM_TYPE[p.type] === guess);
    if (fits.length === 1) d = { ...d, policyNumber: fits[0].policyNumber };
  }

  const stored = mergeScan(d.scan, scan);
  d = { ...d, scan: stored };
  const first = applyProposals(d, stored);
  d = first.draft;
  let applied = first.applied;
  const labels = [...first.labels];

  // The scan panel in the form leaves the date alone (it drives the policy check there). Here the policy is
  // checked right afterwards, so a date read from the document is welcome when nobody has given one.
  const date = scan.fields.find((f) => f.key === 'dateOfLoss');
  if (date && !d.dateOfLoss && isRealDate(date.value) && date.value <= ctx.today && (date.confidence !== 'low' || ctx.role !== 'PROVIDER')) {
    d = addCaptured(setEstimated({ ...d, dateOfLoss: date.value }, 'dateOfLoss', ctx.role === 'PROVIDER' ? 'high' : date.confidence), 'dateOfLoss');
    labels.unshift(d.claimType === 'HEALTH' ? 'Date of service' : 'Date of loss');
    applied++;
  }
  return { draft: withLabels(d, labels), applied, labels: friendlyLabels(labels) };
}

/** Re-applies the stored scan. Run after the policy is verified: a patient can only be matched to a plan member then. */
export function catchUpScan(draft: IntakeDraft): ApplyOutcome {
  if (!draft.scan) return { draft, applied: 0, labels: [] };
  const r = applyProposals(draft, draft.scan);
  return { draft: withLabels(r.draft, r.labels), applied: r.applied, labels: friendlyLabels(r.labels) };
}

// ---------- the policy lookup ----------

/** What the policy lookup applies to a draft once the policy is confirmed. */
export function applyVerifiedPolicy(draft: IntakeDraft, policy: Policy, customer: Customer): ApplyOutcome {
  let d = addCaptured(applyPolicy(draft, policy, customer), 'claimType');
  // A patient named before the plan was known can be matched to a member now.
  if (d.claimType === 'HEALTH' && d.health.patientName && !d.health.memberId) {
    const m = memberMatch(d, { name: d.health.patientName });
    if (m) {
      const r = selectMember(d, m);
      if ('draft' in r) d = r.draft;
    }
  }
  // Anything a document said that needed the plan (the patient, the member ID) can be applied now.
  return catchUpScan(d);
}

export type PolicyLookup = (policyNumber: string, dateOfLoss?: string) => Promise<{ policy: Policy; customer: Customer }>;

export type PolicyCheck =
  | { status: 'skipped'; draft: IntakeDraft }
  | { status: 'verified'; draft: IntakeDraft; applied: number; labels: string[] }
  /** `draft` has the offending field cleared. `text` is the bubble Ease shows. `cause` says what to ask for. */
  | { status: 'failed'; draft: IntakeDraft; cause: 'policy' | 'date'; text: string; message: string };

/**
 * Confirms the policy once both the policy number and the date are known. On success the policy fills in the
 * draft; on failure the field that did not work is cleared so the conversation can ask for it again.
 */
export async function checkPolicy(draft: IntakeDraft, role: Role, lookup: PolicyLookup): Promise<PolicyCheck> {
  const { policyNumber, dateOfLoss } = draft;
  if (!policyNumber || !dateOfLoss || draft.policy) return { status: 'skipped', draft };

  let failure: { message: string; cause: 'policy' | 'date' } | undefined;
  try {
    const { policy, customer } = await lookup(policyNumber, dateOfLoss);
    if (role === 'PROVIDER' && policy.type !== 'HEALTH') failure = { message: 'Healthcare providers can only submit claims against health plans.', cause: 'policy' };
    else return { status: 'verified', ...applyVerifiedPolicy(draft, policy, customer) };
  } catch (e) {
    const message = e instanceof Error && e.message ? e.message : 'The check did not go through.';
    // Is it the policy, or only the date? Look the policy up without the date to find out.
    const cause = await lookup(policyNumber).then(
      () => 'date' as const,
      () => 'policy' as const,
    );
    failure = { message, cause };
  }

  const reason = failure.message.replace(/[.\s]+$/, '');
  const text =
    failure.cause === 'policy'
      ? `I couldn't confirm ${policyNumber}: ${reason}. Which policy should I use?`
      : `I couldn't confirm ${policyNumber} for ${formatDate(dateOfLoss)}: ${reason}. Which date should I use?`;
  const cleared: IntakeDraft =
    failure.cause === 'policy'
      ? { ...draft, policyNumber: '', policy: undefined, customer: undefined }
      : { ...draft, dateOfLoss: '', policy: undefined, customer: undefined, estimatedFields: draft.estimatedFields.filter((k) => k !== 'dateOfLoss') };
  return { status: 'failed', draft: cleared, cause: failure.cause, text, message: failure.message };
}

// ---------- hand-off to the form ----------

const CAPTURED_LABELS = (health: boolean): Record<string, string> => ({
  dateOfLoss: health ? 'Date of service' : 'Date of loss',
  city: 'City',
  state: 'State',
  description: health ? 'Clinical summary' : 'Description',
  estimatedAmount: 'Estimated amount',
  vehicleYear: 'Vehicle',
  vehicleMake: 'Vehicle',
  vehicleModel: 'Vehicle',
  vehicleVin: 'VIN',
  vehicleDamage: 'Vehicle damage',
  policeReportNumber: 'Police report #',
  incidentType: 'Type of incident',
  drivable: 'Drivable',
  injuries: 'Injuries',
  hasOtherParty: 'Other party',
  damageType: 'Type of damage',
  habitable: 'Livable',
  propertyAddress: 'Property address',
  areasAffected: 'Areas affected',
  contractorName: 'Contractor',
  itemsStolenOrDamaged: 'Items stolen or damaged',
  patientName: 'Patient',
  patientDob: 'Date of birth',
  memberId: 'Member ID',
  providerName: 'Provider',
  providerNpi: 'Provider NPI',
  providerTaxId: 'Provider tax ID',
});

/** Friendly names of everything Smart start filled in, for the "Ease filled in N items" banner on the Details step. */
export function capturedLabels(d: IntakeDraft): string[] {
  const names = CAPTURED_LABELS(d.claimType === 'HEALTH');
  const out = new Set<string>();
  if (d.policyNumber) out.add('Policy');
  for (const k of d.captured ?? []) if (names[k]) out.add(names[k]);
  for (const l of d.scan?.appliedLabels ?? []) out.add(l);
  return [...out];
}

/**
 * The draft as the form should receive it. `scan` is what the Details step reads to say "filled in N items",
 * so it is set even when no document was ever dropped.
 */
export function finalizeDraft(d: IntakeDraft, source: AiSource): IntakeDraft {
  const appliedLabels = capturedLabels(d);
  const scan: StoredScan = d.scan
    ? { ...d.scan, applied: true, appliedLabels }
    : { id: String(Date.now()), applied: true, appliedLabels, source, documents: [], fields: [], serviceLines: [], warnings: [] };
  return { ...d, scan };
}

/** Where the form should open: on Details once the policy is confirmed, otherwise on the Policy step to confirm it. */
export function stepForDraft(d: IntakeDraft): number {
  return d.policy ? 2 : 0;
}
