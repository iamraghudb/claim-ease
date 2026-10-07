// The three AI features as plain functions: (request body) in, (result) out.
// No HTTP in here, so they are easy to test and easy to move to another host later.

import {
  EXTRACT_KEYS_BY_TYPE,
  SCAN_DOCUMENT_TYPES,
  type AiStatus,
  type ChatTurn,
  type Confidence,
  type DraftContext,
  type ExplainRequest,
  type ExplainResult,
  type ExtractedField,
  type ExtractedLine,
  type GapCheckResult,
  type GapItem,
  type GapSeverity,
  type ScanDocumentInput,
  type ScannedDocument,
  type ScanRequest,
  type ScanResult,
} from '../src/domain/aiTypes';
import type { ClaimType, DocumentCategory } from '../src/domain/types';
import type { Complete, Part } from './types';
import { demoExplain, demoGaps, demoScan } from './demo';
import { HttpError } from './errors';
import { asArray, bad, clip, isRecord, LIMITS, oneLine, parseContext, toConfidence, toNumber } from './util';
import { EXPLAIN_SYSTEM, GAP_SYSTEM, SCAN_SYSTEM, scanInstructions } from './prompts';
import { createFeatureHandlers } from './features';
import { EXPLAIN_SCHEMA, GAP_SCHEMA, SCAN_SCHEMA } from './schemas';

export interface AiDeps {
  /** null = no API key: answer with demo data. */
  complete: Complete | null;
  model: string;
}

export { LIMITS };

const CLAIM_TYPES: ClaimType[] = ['AUTO', 'PROPERTY', 'HEALTH'];
const SCAN_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);

// ---------- 1. Document scan ----------

export function parseScanRequest(body: unknown): ScanRequest {
  if (!isRecord(body)) throw bad('Expected a JSON body.');
  const claimType = body.claimType as ClaimType | 'UNKNOWN';
  if (claimType !== 'UNKNOWN' && !CLAIM_TYPES.includes(claimType)) throw bad('claimType must be AUTO, PROPERTY, HEALTH or UNKNOWN.');
  const raw = asArray(body.documents);
  if (raw.length === 0) throw bad('Add at least one document to read.');
  if (raw.length > LIMITS.maxDocuments) throw bad(`Read at most ${LIMITS.maxDocuments} documents at a time.`);

  let total = 0;
  const documents = raw.map((d, i): ScanDocumentInput => {
    if (!isRecord(d)) throw bad(`Document ${i + 1} is malformed.`);
    const mimeType = typeof d.mimeType === 'string' ? d.mimeType : '';
    if (!SCAN_MIME.has(mimeType)) throw bad(`"${oneLine(d.fileName, 80)}" is not a type the AI can read. Use a JPEG/PNG/WebP photo, a PDF or a text file.`);
    if (typeof d.data !== 'string' || d.data.length === 0) throw bad(`Document ${i + 1} has no content.`);
    total += d.data.length;
    return { fileName: oneLine(d.fileName, 120) || `document-${i + 1}`, mimeType, data: d.data };
  });
  if (total > LIMITS.maxTotalBase64Chars) throw new HttpError(413, 'These files are too large to read together (about 13 MB max). Try fewer or smaller files.');
  return { claimType, documents };
}

function scanParts(req: ScanRequest): Part[] {
  const parts: Part[] = [];
  req.documents.forEach((d, i) => {
    parts.push({ kind: 'text', text: `Document ${i + 1}: ${d.fileName}` });
    if (d.mimeType === 'text/plain') parts.push({ kind: 'text', text: Buffer.from(d.data, 'base64').toString('utf8') });
    else parts.push({ kind: 'file', mimeType: d.mimeType, data: d.data });
  });
  parts.push({ kind: 'text', text: scanInstructions(req.claimType) });
  return parts;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/** Never trust the model's output blindly: keep only known keys, clamp lengths, fix types. */
export function normalizeScan(raw: unknown, req: ScanRequest): ScanResult {
  const r = isRecord(raw) ? raw : {};
  // When the type was unknown, trust the model's guess; with no guess, allow any document field.
  const guess = CLAIM_TYPES.find((t) => t === r.claimType);
  const effective: ClaimType | undefined = req.claimType === 'UNKNOWN' ? guess : req.claimType;
  const allowed = new Set<string>(effective ? EXTRACT_KEYS_BY_TYPE[effective] : Object.values(EXTRACT_KEYS_BY_TYPE).flat());

  const modelDocs = asArray(r.documents).filter(isRecord);
  const documents: ScannedDocument[] = req.documents.map((d, i) => {
    const m = modelDocs.find((x) => x.fileName === d.fileName) ?? modelDocs[i];
    const type = m?.documentType as DocumentCategory | undefined;
    return { fileName: d.fileName, documentType: type && SCAN_DOCUMENT_TYPES.includes(type) ? type : 'OTHER', summary: clip(m?.summary, 300) };
  });

  const candidates: ExtractedField[] = asArray(r.fields)
    .filter(isRecord)
    .map((f) => ({ key: f.key as ExtractedField['key'], value: clip(f.value, 600), confidence: toConfidence(f.confidence), evidence: clip(f.evidence, 120) }))
    .filter((f) => allowed.has(f.key) && f.value !== '')
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
  // If two documents both report the same field, keep only the most confident one.
  const fields: ExtractedField[] = [];
  for (const f of candidates) {
    if (!fields.some((x) => x.key === f.key)) fields.push(f);
  }

  const serviceLines: ExtractedLine[] =
    effective !== 'HEALTH'
      ? []
      : asArray(r.serviceLines)
          .filter(isRecord)
          .slice(0, 20)
          .map((l) => ({
            description: clip(l.description, 160),
            procedureCode: clip(l.procedureCode, 12).toUpperCase(),
            diagnosisCode: clip(l.diagnosisCode, 12).toUpperCase(),
            units: Math.max(1, Math.round(toNumber(l.units)) || 1),
            billedAmount: Math.max(0, toNumber(l.billedAmount)),
            confidence: toConfidence(l.confidence),
          }));

  const warnings = asArray(r.warnings).map((w) => clip(w, 300)).filter(Boolean).slice(0, 8);
  return { source: 'ai', claimTypeGuess: req.claimType === 'UNKNOWN' ? guess : undefined, documents, fields, serviceLines, warnings };
}

// ---------- 2. Pre-submission check ----------

const SEVERITIES: GapSeverity[] = ['blocker', 'recommended', 'heads_up'];

export function normalizeGaps(raw: unknown, ctx: DraftContext): GapCheckResult {
  const r = isRecord(raw) ? raw : {};
  const items: GapItem[] = asArray(r.items)
    .filter(isRecord)
    .slice(0, 6)
    .map((i) => ({
      severity: SEVERITIES.includes(i.severity as GapSeverity) ? (i.severity as GapSeverity) : 'heads_up',
      title: clip(i.title, 120),
      why: clip(i.why, 300),
      action: clip(i.action, 300),
    }))
    .filter((i) => i.title !== '');
  // The checklist is computed by rules, so it has the last word on "ready".
  const requiredMissing = ctx.checklist.some((c) => c.required && !c.satisfied);
  const readyToSubmit = r.readyToSubmit === true && !requiredMissing && !items.some((i) => i.severity === 'blocker');
  return { source: 'ai', readyToSubmit, headline: clip(r.headline, 240), items };
}

// ---------- 3. Claim assistant ----------

export function parseExplainRequest(body: unknown): ExplainRequest {
  const context = parseContext<ExplainRequest['context']>(body, 'context');
  const b = body as Record<string, unknown>;
  const question = clip(b.question, LIMITS.maxQuestionChars);
  if (!question) throw bad('Type a question first.');
  const history: ChatTurn[] = asArray(b.history)
    .filter(isRecord)
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
    .slice(-LIMITS.maxHistoryTurns)
    .map((t) => ({ role: t.role as ChatTurn['role'], text: clip(t.text, 1500) }));
  return { context, question, history };
}

export function normalizeExplain(raw: unknown): ExplainResult {
  const r = isRecord(raw) ? raw : {};
  const answer = clip(r.answer, 1500);
  if (!answer) throw new HttpError(502, 'The AI returned an empty answer. Try again.');
  return {
    source: 'ai',
    answer,
    followUps: asArray(r.followUps).map((q) => clip(q, 120)).filter(Boolean).slice(0, 3),
  };
}

// ---------- wiring ----------

export function createHandlers({ complete, model }: AiDeps) {
  return {
    ...createFeatureHandlers(complete),
    status: (): AiStatus => ({ configured: complete !== null, model }),

    async scan(body: unknown): Promise<ScanResult> {
      const req = parseScanRequest(body);
      if (!complete) return demoScan(req);
      const raw = await complete({ system: SCAN_SYSTEM, parts: scanParts(req), schema: SCAN_SCHEMA, effort: 'low' });
      return normalizeScan(raw, req);
    },

    async gaps(body: unknown): Promise<GapCheckResult> {
      const context = parseContext<DraftContext>(body, 'context');
      if (!complete) return demoGaps(context);
      const text = `<claim_snapshot>\n${JSON.stringify(context, null, 1)}\n</claim_snapshot>\n\nCheck this claim before it is submitted.`;
      const raw = await complete({ system: GAP_SYSTEM, parts: [{ kind: 'text', text }], schema: GAP_SCHEMA, effort: 'low' });
      return normalizeGaps(raw, context);
    },

    async explain(body: unknown): Promise<ExplainResult> {
      const req = parseExplainRequest(body);
      if (!complete) return demoExplain(req);
      const transcript = req.history.map((t) => `${t.role === 'user' ? 'Person' : 'Assistant'}: ${t.text}`).join('\n');
      const text =
        `<claim_snapshot>\n${JSON.stringify(req.context, null, 1)}\n</claim_snapshot>\n\n` +
        (transcript ? `Conversation so far:\n${transcript}\n\n` : '') +
        `New question from the person: ${req.question}`;
      const raw = await complete({ system: EXPLAIN_SYSTEM, parts: [{ kind: 'text', text }], schema: EXPLAIN_SCHEMA, effort: 'low', maxTokens: 4000 });
      return normalizeExplain(raw);
    },
  };
}

export type AiHandlers = ReturnType<typeof createHandlers>;
