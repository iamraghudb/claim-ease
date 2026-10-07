// Shapes exchanged between the browser and the AI server (server/*).
// Both sides import this file, so a change here is type-checked on both ends.
// Pure types and constants: no React, no I/O.

import type { ClaimType, DocumentCategory, PolicyType, Role } from './types';

/** 'ai' = a real model answered. 'demo' = no API key is configured; sample data. */
export type AiSource = 'ai' | 'demo';
export type Confidence = 'high' | 'medium' | 'low';

export interface AiStatus {
  configured: boolean;
  model: string;
}

// ---------- 1. Document scan: read bills / estimates / receipts, fill the form ----------

/** Every form value the scanner is allowed to report. */
export const EXTRACT_KEYS = [
  'dateOfLoss',
  'city',
  'state',
  'description',
  'estimatedAmount',
  // health
  'patientName',
  'patientDob',
  'memberId',
  'providerName',
  'providerNpi',
  'providerTaxId',
  // auto
  'vehicleYear',
  'vehicleMake',
  'vehicleModel',
  'vehicleVin',
  'vehicleDamage',
  'policeReportNumber',
  // property
  'propertyAddress',
  'areasAffected',
  'contractorName',
  'itemsStolenOrDamaged',
] as const;
export type ExtractKey = (typeof EXTRACT_KEYS)[number];

const COMMON: ExtractKey[] = ['dateOfLoss', 'city', 'state', 'description', 'estimatedAmount'];

/** Which keys make sense for each claim type, so the model isn't asked for a VIN on a health bill. */
export const EXTRACT_KEYS_BY_TYPE: Record<ClaimType, ExtractKey[]> = {
  HEALTH: [...COMMON, 'patientName', 'patientDob', 'memberId', 'providerName', 'providerNpi', 'providerTaxId'],
  AUTO: [...COMMON, 'vehicleYear', 'vehicleMake', 'vehicleModel', 'vehicleVin', 'vehicleDamage', 'policeReportNumber'],
  PROPERTY: [...COMMON, 'propertyAddress', 'areasAffected', 'contractorName', 'itemsStolenOrDamaged'],
};

/** What a document can be classified as (a subset of DocumentCategory the model can tell from content). */
export const SCAN_DOCUMENT_TYPES: DocumentCategory[] = [
  'INVOICE',
  'RECEIPT',
  'REPAIR_ESTIMATE',
  'POLICE_REPORT',
  'MEDICAL_RECORD',
  'PHOTO',
  'OTHER',
];

export interface ScanDocumentInput {
  fileName: string;
  /** image/jpeg, image/png, image/gif, image/webp, application/pdf or text/plain */
  mimeType: string;
  /** Base64 file contents, no `data:` prefix. */
  data: string;
}

export interface ScanRequest {
  /** 'UNKNOWN' lets the AI work out the claim type from the documents (Smart start, before a policy is chosen). */
  claimType: ClaimType | 'UNKNOWN';
  documents: ScanDocumentInput[];
}

export interface ScannedDocument {
  fileName: string;
  documentType: DocumentCategory;
  summary: string;
}

export interface ExtractedField {
  key: ExtractKey;
  value: string;
  confidence: Confidence;
  /** Where on the document it was read, e.g. "Header: Patient Name". */
  evidence: string;
}

export interface ExtractedLine {
  description: string;
  procedureCode: string;
  diagnosisCode: string;
  units: number;
  billedAmount: number;
  confidence: Confidence;
}

export interface ScanResult {
  source: AiSource;
  /** What the documents look like they are for. Only filled in when the request said 'UNKNOWN'. */
  claimTypeGuess?: ClaimType;
  documents: ScannedDocument[];
  fields: ExtractedField[];
  serviceLines: ExtractedLine[];
  warnings: string[];
}

// ---------- 2. Pre-submission check: what is missing, in plain English ----------

export interface DraftContext {
  claimType: ClaimType;
  readinessScore: number;
  /** The deterministic checklist (domain/requirements.ts) the app already computed. */
  checklist: { label: string; required: boolean; satisfied: boolean; estimated: boolean }[];
  /** A few non-identifying facts about the claim, as plain key/value pairs. */
  facts: Record<string, string | number | boolean>;
  documents: { category: string; fileName: string; aiSummary?: string }[];
  /** Labels of the rules-engine review triggers the filer already sees. */
  reviewTriggers: string[];
  scanWarnings: string[];
}

export type GapSeverity = 'blocker' | 'recommended' | 'heads_up';

export interface GapItem {
  severity: GapSeverity;
  title: string;
  why: string;
  action: string;
}

export interface GapCheckResult {
  source: AiSource;
  readyToSubmit: boolean;
  headline: string;
  items: GapItem[];
}

// ---------- 3. Claim assistant: explain status in plain language ----------

export interface ClaimContext {
  /** Current time, so "how long has it been" is answerable. */
  now: string;
  claimType: ClaimType;
  status: string;
  statusMeaning: string;
  filedOn: string;
  dateOfLoss: string;
  amountClaimed: number;
  stages: { label: string; state: string; date?: string }[];
  sla: { state: string; summary: string; dueDate: string };
  openRequests: { requestedAt: string; message: string; stillNeeded: string[] }[];
  decision?: { outcome: string; approvedAmount: number; reason?: string; explanation: string; decidedAt: string };
  payment?: { method: string; amount: number; date: string };
  appeals: { filedAt: string }[];
  recentActivity: { when: string; what: string }[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ExplainRequest {
  context: ClaimContext;
  question: string;
  history: ChatTurn[];
}

export interface ExplainResult {
  source: AiSource;
  answer: string;
  followUps: string[];
}

// ---------- Ease copilot: the assistant that follows you around the app ----------

/** What the person is looking at, supplied by the screen (or a default derived from the route). */
export interface CopilotPage {
  path: string;
  title: string;
  /** One or two sentences about what this screen shows and what it is for. */
  summary: string;
  /** A JSON-safe snapshot of the screen's data (claim context, queue stats, draft facts...). Keep it small. */
  data?: unknown;
  /** Starter questions worth offering on this screen. */
  suggestions?: string[];
}

export interface CopilotRequest {
  role: Role;
  page: CopilotPage;
  question: string;
  history: ChatTurn[];
}

/** A button the copilot can offer. `to` must be an in-app path; the UI checks it before showing it. */
export interface CopilotAction {
  label: string;
  to: string;
}

export interface CopilotResult {
  source: AiSource;
  answer: string;
  followUps: string[];
  actions: CopilotAction[];
}

// ---------- Smart start: file a claim by talking ----------

export const INTAKE_EXTRA_KEYS = ['policyNumber', 'incidentType', 'damageType', 'drivable', 'injuries', 'habitable', 'hasOtherParty'] as const;
/** Everything Smart start can capture: all scan fields plus the answers a conversation adds. */
export const INTAKE_KEYS = [...EXTRACT_KEYS, ...INTAKE_EXTRA_KEYS] as const;
export type IntakeKey = (typeof INTAKE_KEYS)[number];

export interface IntakeField {
  key: IntakeKey;
  /** Yes/no answers are 'yes' or 'no'. Enum answers use the form's own values (e.g. COLLISION, WATER). */
  value: string;
  confidence: Confidence;
}

export interface IntakePolicy {
  policyNumber: string;
  type: PolicyType;
  /** Plain label the AI can say out loud, e.g. "Auto, Toyota RAV4". */
  label: string;
}

export interface IntakeRequest {
  role: Role;
  /** Today's date (YYYY-MM-DD) so "yesterday" can be resolved. */
  today: string;
  policies: IntakePolicy[];
  /** Facts already captured, as key -> value. */
  known: Record<string, string>;
  documents: { fileName: string; documentType: string; summary: string }[];
  /** The conversation so far. The last turn is the person's. */
  conversation: ChatTurn[];
}

export interface IntakeResult {
  source: AiSource;
  /** What Ease says next: confirm what it understood, then ask for the one thing still missing. */
  reply: string;
  fields: IntakeField[];
  quickReplies: string[];
  /** True when enough is known to move on to review. */
  done: boolean;
  stillNeeded: string[];
}

// ---------- Staff AI ----------

/** Everything an adjuster's claim brief may use. Unlike ClaimContext this includes internal analysis, but no personal details. */
export interface StaffClaimContext {
  claimType: ClaimType;
  status: string;
  statusMeaning: string;
  description: string;
  dateOfLoss: string;
  amountClaimed: number;
  estimatedFields: string[];
  uncertaintyScore: number;
  complexity: string;
  priority: string;
  fastTrackEligible: boolean;
  checks: { label: string; status: string; explanation: string }[];
  triggers: { label: string; explanation: string }[];
  payable: { claimed: number; allowed: number; deductible: number; copay: number; coinsurance: number; limitReduction: number; payable: number; claimantResponsibility: number };
  documents: { category: string; count: number }[];
  openInfoRequests: number;
  notes: string[];
  experts: { type: string; status: string; summary?: string }[];
  policy?: { type: string; deductible: number; coverages: string[]; exclusions: string[] };
  decision?: { outcome: string; approvedAmount: number };
}

export type BriefAction = 'APPROVE' | 'PARTIALLY_APPROVE' | 'DENY' | 'REQUEST_INFO' | 'INVESTIGATE' | 'WAIT';

export interface BriefResult {
  source: AiSource;
  headline: string;
  summary: string;
  risks: { title: string; plain: string; severity: 'low' | 'medium' | 'high' }[];
  recommended: { action: BriefAction; why: string };
  verify: string[];
}

export type DraftKind = 'decision_explanation' | 'info_request_message' | 'appeal_letter' | 'cost_explanation';

export interface DraftRequest {
  kind: DraftKind;
  /** Facts the draft may use. Keep to what the reader is entitled to see. */
  context: Record<string, unknown>;
  /** The person's own words to build on (for example why they disagree with a decision). */
  notes?: string;
}

export interface DraftResult {
  source: AiSource;
  text: string;
}

export interface DashboardStats {
  totalClaims: number;
  decided: number;
  avgDaysToDecision: number | null;
  fastTrackPct: number;
  needInfoPct: number;
  denialPct: number;
  appeals: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  topDelayReasons: { reason: string; count: number }[];
  slaAtRisk: number;
  slaOverdue: number;
}

export interface InsightsRequest {
  stats: DashboardStats;
  question?: string;
  history?: ChatTurn[];
}

export interface InsightItem {
  title: string;
  detail: string;
  tone: 'good' | 'watch' | 'risk';
  suggestion: string;
}

export interface InsightsResult {
  source: AiSource;
  headline: string;
  insights: InsightItem[];
  /** Answer to `question`, or an empty string when none was asked. */
  answer: string;
}

// ---------- Claimant AI extras ----------

export interface PhotoRequest {
  claimType: ClaimType;
  photos: ScanDocumentInput[];
}

export interface PhotoFinding {
  fileName: string;
  quality: 'good' | 'ok' | 'poor';
  whatWeSee: string;
  issues: string[];
}

export interface PhotoResult {
  source: AiSource;
  findings: PhotoFinding[];
  severity: 'minor' | 'moderate' | 'severe' | 'unclear';
  summary: string;
  missingShots: string[];
}
