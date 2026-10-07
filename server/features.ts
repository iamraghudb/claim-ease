// The newer AI features as plain functions: (request body) in, (result) out.
//  - copilot  : "Ask Ease", the assistant that follows you around the app
//  - intake   : Smart start, filing a claim by talking
//  - brief    : the adjuster's one-glance claim brief
//  - draft    : drafted letters and messages for a person to edit
//  - insights : narrated dashboard insights for the admin
//  - photo    : feedback on claim photos
// Same rules as handlers.ts: validate what comes in, never trust what comes back.

import { isAllowedPath } from '../src/domain/aiRoutes';
import {
  INTAKE_KEYS,
  type BriefAction,
  type BriefResult,
  type ChatTurn,
  type CopilotAction,
  type CopilotPage,
  type CopilotRequest,
  type CopilotResult,
  type DraftKind,
  type DraftRequest,
  type DraftResult,
  type InsightsRequest,
  type InsightsResult,
  type IntakeField,
  type IntakeKey,
  type IntakePolicy,
  type IntakeRequest,
  type IntakeResult,
  type PhotoFinding,
  type PhotoRequest,
  type PhotoResult,
  type ScanDocumentInput,
  type StaffClaimContext,
} from '../src/domain/aiTypes';
import { AUTO_INCIDENT_TYPES, PROPERTY_DAMAGE_TYPES } from '../src/domain/catalog';
import type { ClaimType, PolicyType, Role } from '../src/domain/types';
import { demoBrief, demoCopilot, demoDraft, demoInsights, demoIntake, demoPhoto } from './demoFeatures';
import { HttpError } from './errors';
import { BRIEF_SYSTEM, copilotSystem, draftSystem, INSIGHTS_SYSTEM, INTAKE_SYSTEM, PHOTO_SYSTEM } from './prompts';
import { BRIEF_SCHEMA, COPILOT_SCHEMA, DRAFT_SCHEMA, INSIGHTS_SCHEMA, INTAKE_SCHEMA, PHOTO_SCHEMA } from './schemas';
import type { Complete, Part } from './types';
import { asArray, bad, clip, isRecord, LIMITS, oneLine, parseContext, tagged } from './util';

const ROLES: Role[] = ['CLAIMANT', 'PROVIDER', 'ADJUSTER', 'ADMIN'];
const CLAIM_TYPES: ClaimType[] = ['AUTO', 'PROPERTY', 'HEALTH'];
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function parseRole(v: unknown): Role {
  if (!ROLES.includes(v as Role)) throw bad('Unknown role.');
  return v as Role;
}

function parseHistory(v: unknown, max: number = LIMITS.maxHistoryTurns): ChatTurn[] {
  return asArray(v)
    .filter(isRecord)
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .slice(-max)
    .map((t) => ({ role: t.role as ChatTurn['role'], text: clip(t.text, 1500) }));
}

const transcript = (history: ChatTurn[]) => history.map((t) => `${t.role === 'user' ? 'Person' : 'Ease'}: ${t.text}`).join('\n');

// ---------- Ease copilot ----------

export function parseCopilotRequest(body: unknown): CopilotRequest {
  if (!isRecord(body)) throw bad('Expected a JSON body.');
  const role = parseRole(body.role);
  if (!isRecord(body.page)) throw bad('Missing "page".');
  const p = body.page;
  const page: CopilotPage = {
    path: clip(p.path, 200),
    title: oneLine(p.title, 120),
    summary: clip(p.summary, 600),
    data: p.data,
    suggestions: asArray(p.suggestions).map((s) => clip(s, 100)).filter(Boolean).slice(0, 6),
  };
  if (JSON.stringify(page.data ?? null).length > LIMITS.maxContextChars) throw new HttpError(413, 'That screen snapshot is too large.');
  const question = clip(body.question, LIMITS.maxQuestionChars);
  if (!question) throw bad('Type a question first.');
  return { role, page, question, history: parseHistory(body.history) };
}

export function normalizeCopilot(raw: unknown, role: Role): CopilotResult {
  const r = isRecord(raw) ? raw : {};
  const answer = clip(r.answer, 1200);
  if (!answer) throw new HttpError(502, 'The AI returned an empty answer. Try again.');
  const actions: CopilotAction[] = asArray(r.actions)
    .filter(isRecord)
    .map((a) => ({ label: oneLine(a.label, 40), to: clip(a.to, 120) }))
    // The model may only send people to real pages.
    .filter((a) => a.label !== '' && isAllowedPath(role, a.to))
    .slice(0, 2);
  return { source: 'ai', answer, followUps: asArray(r.followUps).map((q) => clip(q, 120)).filter(Boolean).slice(0, 3), actions };
}

// ---------- Smart start ----------

const YES_NO_KEYS = new Set<string>(['drivable', 'injuries', 'habitable', 'hasOtherParty']);
const INCIDENT_VALUES: string[] = AUTO_INCIDENT_TYPES.map((t) => t.value);
const DAMAGE_VALUES: string[] = PROPERTY_DAMAGE_TYPES.map((t) => t.value);
const POLICY_TYPES: PolicyType[] = ['AUTO', 'HOME', 'RENTERS', 'HEALTH'];

export function parseIntakeRequest(body: unknown): IntakeRequest {
  if (!isRecord(body)) throw bad('Expected a JSON body.');
  const role = parseRole(body.role);
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : '';
  if (!today) throw bad('"today" must be a YYYY-MM-DD date.');

  const policies: IntakePolicy[] = asArray(body.policies)
    .filter(isRecord)
    .slice(0, 10)
    .filter((p) => POLICY_TYPES.includes(p.type as PolicyType) && /^POL-\d{6}$/.test(clip(p.policyNumber, 20)))
    .map((p) => ({ policyNumber: clip(p.policyNumber, 20), type: p.type as PolicyType, label: oneLine(p.label, 80) }));

  const known: Record<string, string> = {};
  if (isRecord(body.known)) for (const [k, v] of Object.entries(body.known).slice(0, 40)) known[oneLine(k, 40)] = oneLine(v, 400);

  const documents = asArray(body.documents)
    .filter(isRecord)
    .slice(0, LIMITS.maxDocuments)
    .map((d) => ({ fileName: oneLine(d.fileName, 120), documentType: oneLine(d.documentType, 40), summary: oneLine(d.summary, 300) }));

  const conversation = parseHistory(body.conversation, 20);
  // The last turn may be Ease's own (it just read a file and said what it found), so only require that the person has spoken.
  if (!conversation.some((t) => t.role === 'user')) throw bad('The conversation needs a message from the person.');
  return { role, today, policies, known, documents, conversation };
}

interface Essential {
  label: string;
  /** What to ask when this is the next thing missing. */
  ask: string;
}

/** What must be known before a claim can move on to review. Deterministic, so the AI cannot declare "done" early. */
function missingEssentials(known: Record<string, string>, hasDocuments: boolean, needAmount: boolean): Essential[] {
  const missing: Essential[] = [];
  const need = (have: unknown, label: string, ask: string) => {
    if (!have) missing.push({ label, ask });
  };
  need(known.claimType, 'The kind of claim', 'What kind of claim is this: auto, home or health?');
  need(known.policyNumber, 'Which policy', 'Which policy is this for?');
  need(known.dateOfLoss, 'Date it happened', 'When did it happen?');
  need(known.description, 'What happened', 'Can you tell me what happened, in your own words?');
  if (known.claimType === 'AUTO') {
    need(known.vehicleDamage, 'What was damaged', 'What got damaged on the car?');
    need(known.drivable, 'Whether the car is drivable', 'Is the car drivable?');
    need(known.injuries, 'Whether anyone was hurt', 'Was anyone hurt?');
    if (needAmount) need(known.estimatedAmount, 'A rough amount', 'Roughly how much do you think it will cost?');
  } else if (known.claimType === 'PROPERTY') {
    need(known.damageType, 'The kind of damage', 'What kind of damage is it, for example water, fire, wind or theft?');
    need(known.habitable, 'Whether the home is livable', 'Is the home livable right now?');
    if (needAmount) need(known.estimatedAmount, 'A rough amount', 'Roughly how much do you think it will cost?');
  } else if (known.claimType === 'HEALTH') {
    need(hasDocuments || known.patientName, 'The bill or the services', 'Can you drop in the itemized bill, or tell me who the patient was and what was done?');
  }
  return missing;
}

const AUTO_KEYS = new Set(['vehicleDamage', 'drivable', 'incidentType', 'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehicleVin', 'policeReportNumber', 'hasOtherParty']);
const PROPERTY_KEYS = new Set(['damageType', 'habitable', 'areasAffected', 'propertyAddress', 'itemsStolenOrDamaged', 'contractorName']);
const HEALTH_KEYS = new Set(['patientName', 'patientDob', 'memberId', 'providerName', 'providerNpi', 'providerTaxId']);

/** The kind of claim the captured facts point to, or undefined when they are mixed or there are none. */
function inferKind(known: Record<string, string>): 'AUTO' | 'PROPERTY' | 'HEALTH' | undefined {
  const kinds = new Set<string>();
  for (const k of Object.keys(known)) {
    if (AUTO_KEYS.has(k)) kinds.add('AUTO');
    if (PROPERTY_KEYS.has(k)) kinds.add('PROPERTY');
    if (HEALTH_KEYS.has(k)) kinds.add('HEALTH');
  }
  return kinds.size === 1 ? ([...kinds][0] as 'AUTO' | 'PROPERTY' | 'HEALTH') : undefined;
}

const kindOfPolicy = (t: PolicyType) => (t === 'AUTO' ? 'AUTO' : t === 'HEALTH' ? 'HEALTH' : 'PROPERTY');

function cleanIntakeValue(key: IntakeKey, raw: unknown, req: IntakeRequest): string | null {
  const v = clip(raw, 400);
  if (!v) return null;
  switch (key) {
    case 'policyNumber': {
      const up = v.toUpperCase();
      return req.policies.length ? (req.policies.some((p) => p.policyNumber === up) ? up : null) : /^POL-\d{6}$/.test(up) ? up : null;
    }
    case 'dateOfLoss':
    case 'patientDob':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      return key === 'dateOfLoss' && v > req.today ? null : v;
    case 'state': {
      const up = v.toUpperCase();
      return /^[A-Z]{2}$/.test(up) ? up : null;
    }
    case 'estimatedAmount': {
      const n = Number(v.replace(/[$,\s]/g, ''));
      return Number.isFinite(n) && n > 0 ? String(n) : null;
    }
    case 'incidentType':
      return INCIDENT_VALUES.includes(v.toUpperCase()) ? v.toUpperCase() : null;
    case 'damageType':
      return DAMAGE_VALUES.includes(v.toUpperCase()) ? v.toUpperCase() : null;
    default:
      if (YES_NO_KEYS.has(key)) return /^(yes|y|true)$/i.test(v) ? 'yes' : /^(no|n|false)$/i.test(v) ? 'no' : null;
      return v;
  }
}

export function normalizeIntake(raw: unknown, req: IntakeRequest): IntakeResult {
  const r = isRecord(raw) ? raw : {};
  const reply = clip(r.reply, 700);
  if (!reply) throw new HttpError(502, 'The AI returned an empty answer. Try again.');

  // Keep only known keys with sensible values; if a key repeats, the most confident (then the later) one wins.
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const fields: IntakeField[] = [];
  for (const f of asArray(r.fields).filter(isRecord)) {
    const key = f.key as IntakeKey;
    if (!(INTAKE_KEYS as readonly string[]).includes(key)) continue;
    const value = cleanIntakeValue(key, f.value, req);
    if (value === null) continue;
    const confidence = f.confidence === 'high' || f.confidence === 'medium' || f.confidence === 'low' ? f.confidence : 'low';
    const at = fields.findIndex((x) => x.key === key);
    if (at === -1) fields.push({ key, value, confidence });
    else if (rank[confidence] <= rank[fields[at].confidence]) fields[at] = { key, value, confidence };
  }

  const merged: Record<string, string> = { ...req.known };
  for (const f of fields) merged[f.key] = f.value;

  // Backstop: when the facts point to one kind of claim and the person has exactly one policy of that
  // kind, choose it, even if the model asked instead.
  let chosenByUs: IntakePolicy | undefined;
  if (!merged.policyNumber && req.policies.length > 0) {
    const kind = (merged.claimType as 'AUTO' | 'PROPERTY' | 'HEALTH' | undefined) ?? inferKind(merged);
    const matching = kind ? req.policies.filter((p) => kindOfPolicy(p.type) === kind) : [];
    if (matching.length === 1) {
      chosenByUs = matching[0];
      merged.policyNumber = chosenByUs.policyNumber;
      fields.push({ key: 'policyNumber', value: chosenByUs.policyNumber, confidence: 'medium' });
    }
  }
  // The policy fixes the claim type: AUTO -> AUTO, HOME/RENTERS -> PROPERTY, HEALTH -> HEALTH.
  const policy = req.policies.find((p) => p.policyNumber === merged.policyNumber);
  if (policy) merged.claimType = kindOfPolicy(policy.type);
  else if (!merged.claimType) merged.claimType = inferKind(merged) ?? '';

  // A rough amount only counts as missing while the model still wants one: when it says "done", the person either
  // gave a figure or said they do not know it, and the details step will ask again if it is needed.
  const modelDone = r.done === true;
  const missing = missingEssentials(merged, req.documents.length > 0, !modelDone);
  const done = modelDone && missing.length === 0;

  // If we chose the policy but the model was still asking which one, say the right thing instead.
  let finalReply = reply;
  if (chosenByUs && /\bwhich\b.*\bpolic/i.test(reply)) finalReply = `Thanks, I'll use your ${chosenByUs.label} policy. ${missing[0]?.ask ?? 'That is everything I need.'}`;

  return {
    source: 'ai',
    reply: finalReply,
    fields,
    quickReplies: asArray(r.quickReplies).map((q) => oneLine(q, 40)).filter(Boolean).slice(0, 4),
    done,
    // Always plain labels worked out from the rules above, never the model's own wording.
    stillNeeded: done ? [] : missing.map((m) => m.label),
  };
}

// ---------- Staff brief ----------

const ACTIONS: BriefAction[] = ['APPROVE', 'PARTIALLY_APPROVE', 'DENY', 'REQUEST_INFO', 'INVESTIGATE', 'WAIT'];

export function normalizeBrief(raw: unknown, ctx: StaffClaimContext): BriefResult {
  const r = isRecord(raw) ? raw : {};
  const rec = isRecord(r.recommended) ? r.recommended : {};
  let action: BriefAction = ACTIONS.includes(rec.action as BriefAction) ? (rec.action as BriefAction) : 'WAIT';

  // The rules engine has the last word: advice may not contradict a failed or fully passed check list.
  const anyFail = ctx.checks.some((c) => c.status === 'FAIL');
  if ((action === 'APPROVE' || action === 'PARTIALLY_APPROVE') && anyFail) action = 'INVESTIGATE';
  if (action === 'DENY' && !anyFail) action = 'INVESTIGATE';

  const severities = ['low', 'medium', 'high'] as const;
  return {
    source: 'ai',
    headline: clip(r.headline, 160),
    summary: clip(r.summary, 700),
    risks: asArray(r.risks)
      .filter(isRecord)
      .slice(0, 4)
      .map((k) => ({ title: oneLine(k.title, 80), plain: clip(k.plain, 260), severity: severities.find((s) => s === k.severity) ?? 'medium' }))
      .filter((k) => k.title !== ''),
    recommended: { action, why: clip(rec.why, 260) },
    verify: asArray(r.verify).map((v) => clip(v, 140)).filter(Boolean).slice(0, 3),
  };
}

// ---------- Drafts ----------

const DRAFT_KINDS: DraftKind[] = ['decision_explanation', 'info_request_message', 'appeal_letter', 'cost_explanation'];

export function parseDraftRequest(body: unknown): DraftRequest {
  const context = parseContext<Record<string, unknown>>(body, 'context');
  const b = body as Record<string, unknown>;
  if (!DRAFT_KINDS.includes(b.kind as DraftKind)) throw bad('Unknown kind of draft.');
  return { kind: b.kind as DraftKind, context, notes: clip(b.notes, 1500) || undefined };
}

// ---------- Insights ----------

export function normalizeInsights(raw: unknown): InsightsResult {
  const r = isRecord(raw) ? raw : {};
  const tones = ['good', 'watch', 'risk'] as const;
  return {
    source: 'ai',
    headline: clip(r.headline, 220),
    insights: asArray(r.insights)
      .filter(isRecord)
      .slice(0, 4)
      .map((i) => ({ title: oneLine(i.title, 80), detail: clip(i.detail, 300), tone: tones.find((t) => t === i.tone) ?? 'watch', suggestion: clip(i.suggestion, 220) }))
      .filter((i) => i.title !== ''),
    answer: clip(r.answer, 800),
  };
}

// ---------- Photo check ----------

export function parsePhotoRequest(body: unknown): PhotoRequest {
  if (!isRecord(body)) throw bad('Expected a JSON body.');
  if (!CLAIM_TYPES.includes(body.claimType as ClaimType)) throw bad('claimType must be AUTO, PROPERTY or HEALTH.');
  const raw = asArray(body.photos);
  if (raw.length === 0) throw bad('Add at least one photo to check.');
  if (raw.length > LIMITS.maxDocuments) throw bad(`Check at most ${LIMITS.maxDocuments} photos at a time.`);
  let total = 0;
  const photos = raw.map((d, i): ScanDocumentInput => {
    if (!isRecord(d)) throw bad(`Photo ${i + 1} is malformed.`);
    const mimeType = typeof d.mimeType === 'string' ? d.mimeType : '';
    if (!IMAGE_MIME.has(mimeType)) throw bad(`"${oneLine(d.fileName, 80)}" is not a photo the AI can look at. Use JPEG, PNG or WebP.`);
    if (typeof d.data !== 'string' || d.data.length === 0) throw bad(`Photo ${i + 1} has no content.`);
    total += d.data.length;
    return { fileName: oneLine(d.fileName, 120) || `photo-${i + 1}`, mimeType, data: d.data };
  });
  if (total > LIMITS.maxTotalBase64Chars) throw new HttpError(413, 'These photos are too large to check together. Try fewer or smaller ones.');
  return { claimType: body.claimType as ClaimType, photos };
}

export function normalizePhoto(raw: unknown, req: PhotoRequest): PhotoResult {
  const r = isRecord(raw) ? raw : {};
  const found = asArray(r.findings).filter(isRecord);
  const qualities = ['good', 'ok', 'poor'] as const;
  const findings: PhotoFinding[] = req.photos.map((p, i) => {
    const f = found.find((x) => x.fileName === p.fileName) ?? found[i] ?? {};
    return {
      fileName: p.fileName,
      quality: qualities.find((q) => q === f.quality) ?? 'ok',
      whatWeSee: clip(f.whatWeSee, 260),
      issues: asArray(f.issues).map((x) => clip(x, 100)).filter(Boolean).slice(0, 4),
    };
  });
  const severities = ['minor', 'moderate', 'severe', 'unclear'] as const;
  return {
    source: 'ai',
    findings,
    severity: severities.find((s) => s === r.severity) ?? 'unclear',
    summary: clip(r.summary, 320),
    missingShots: asArray(r.missingShots).map((x) => clip(x, 110)).filter(Boolean).slice(0, 4),
  };
}

// ---------- wiring ----------

export function createFeatureHandlers(complete: Complete | null) {
  return {
    async copilot(body: unknown): Promise<CopilotResult> {
      const req = parseCopilotRequest(body);
      if (!complete) return demoCopilot(req);
      const text =
        `${tagged('screen', { title: req.page.title, path: req.page.path, summary: req.page.summary, data: req.page.data })}\n\n` +
        (req.history.length ? `Conversation so far:\n${transcript(req.history)}\n\n` : '') +
        `New question from the person: ${req.question}`;
      const raw = await complete({ system: copilotSystem(req.role), parts: [{ kind: 'text', text }], schema: COPILOT_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizeCopilot(raw, req.role);
    },

    async intake(body: unknown): Promise<IntakeResult> {
      const req = parseIntakeRequest(body);
      if (!complete) return demoIntake(req);
      const text =
        `${tagged('context', { today: req.today, role: req.role, policies: req.policies.map((p) => ({ ...p, usedFor: { AUTO: 'auto claims', HOME: 'home claims', RENTERS: 'home claims', HEALTH: 'health claims' }[p.type] })), alreadyKnown: req.known, documentsRead: req.documents })}\n\n` +
        `Conversation so far:\n${transcript(req.conversation)}`;
      const raw = await complete({ system: INTAKE_SYSTEM, parts: [{ kind: 'text', text }], schema: INTAKE_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizeIntake(raw, req);
    },

    async brief(body: unknown): Promise<BriefResult> {
      const context = parseContext<StaffClaimContext>(body, 'context');
      if (!complete) return demoBrief(context);
      const raw = await complete({ system: BRIEF_SYSTEM, parts: [{ kind: 'text', text: `${tagged('claim', context)}\n\nWrite the brief.` }], schema: BRIEF_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizeBrief(raw, context);
    },

    async draft(body: unknown): Promise<DraftResult> {
      const req = parseDraftRequest(body);
      if (!complete) return demoDraft(req);
      const text = `${tagged('facts', req.context)}${req.notes ? `\n\nThe person's own notes (build on these):\n${req.notes}` : ''}\n\nWrite the draft.`;
      const raw = await complete({ system: draftSystem(req.kind), parts: [{ kind: 'text', text }], schema: DRAFT_SCHEMA, effort: 'low', maxTokens: 3000 });
      const out = isRecord(raw) ? clip(raw.text, 2500) : '';
      if (!out) throw new HttpError(502, 'The AI returned an empty draft. Try again.');
      return { source: 'ai', text: out };
    },

    async insights(body: unknown): Promise<InsightsResult> {
      const stats = parseContext<InsightsRequest['stats']>(body, 'stats');
      const b = body as Record<string, unknown>;
      const req: InsightsRequest = { stats, question: clip(b.question, LIMITS.maxQuestionChars) || undefined, history: parseHistory(b.history, 6) };
      if (!complete) return demoInsights(req);
      const text =
        `${tagged('stats', req.stats)}\n\n` +
        (req.history?.length ? `Earlier questions:\n${transcript(req.history)}\n\n` : '') +
        (req.question ? `Question from the manager: ${req.question}` : 'No question: summarise the picture.');
      const raw = await complete({ system: INSIGHTS_SYSTEM, parts: [{ kind: 'text', text }], schema: INSIGHTS_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizeInsights(raw);
    },

    async photo(body: unknown): Promise<PhotoResult> {
      const req = parsePhotoRequest(body);
      if (!complete) return demoPhoto(req);
      const parts: Part[] = [];
      req.photos.forEach((p, i) => {
        parts.push({ kind: 'text', text: `Photo ${i + 1}: ${p.fileName}` }, { kind: 'file', mimeType: p.mimeType, data: p.data });
      });
      parts.push({ kind: 'text', text: `These photos are for a ${req.claimType} claim. Review them and return the result.` });
      const raw = await complete({ system: PHOTO_SYSTEM, parts, schema: PHOTO_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizePhoto(raw, req);
    },
  };
}
