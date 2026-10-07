// JSON Schemas for structured outputs: the API forces the model's answer to match these.
// Rules of the format: every object needs `additionalProperties: false` and lists all its
// properties in `required`. For "optional" data we use arrays (empty = nothing found).

import { EXTRACT_KEYS, INTAKE_KEYS, SCAN_DOCUMENT_TYPES } from '../src/domain/aiTypes';

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const confidence = { type: 'string', enum: ['high', 'medium', 'low'] } as const;
const strings = { type: 'array', items: str } as const;

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const SCAN_SCHEMA = obj({
  claimType: { type: 'string', enum: ['AUTO', 'PROPERTY', 'HEALTH', 'UNKNOWN'] },
  documents: {
    type: 'array',
    items: obj({ fileName: str, documentType: { type: 'string', enum: [...SCAN_DOCUMENT_TYPES] }, summary: str }),
  },
  fields: {
    type: 'array',
    items: obj({ key: { type: 'string', enum: [...EXTRACT_KEYS] }, value: str, confidence, evidence: str }),
  },
  serviceLines: {
    type: 'array',
    items: obj({ description: str, procedureCode: str, diagnosisCode: str, units: num, billedAmount: num, confidence }),
  },
  warnings: strings,
});

export const GAP_SCHEMA = obj({
  readyToSubmit: { type: 'boolean' },
  headline: str,
  items: {
    type: 'array',
    items: obj({ severity: { type: 'string', enum: ['blocker', 'recommended', 'heads_up'] }, title: str, why: str, action: str }),
  },
});

export const EXPLAIN_SCHEMA = obj({
  answer: str,
  followUps: strings,
});

export const COPILOT_SCHEMA = obj({
  answer: str,
  followUps: strings,
  actions: { type: 'array', items: obj({ label: str, to: str }) },
});

export const INTAKE_SCHEMA = obj({
  reply: str,
  fields: { type: 'array', items: obj({ key: { type: 'string', enum: [...INTAKE_KEYS] }, value: str, confidence }) },
  quickReplies: strings,
  done: { type: 'boolean' },
  stillNeeded: strings,
});

export const BRIEF_SCHEMA = obj({
  headline: str,
  summary: str,
  risks: { type: 'array', items: obj({ title: str, plain: str, severity: { type: 'string', enum: ['low', 'medium', 'high'] } }) },
  recommended: obj({ action: { type: 'string', enum: ['APPROVE', 'PARTIALLY_APPROVE', 'DENY', 'REQUEST_INFO', 'INVESTIGATE', 'WAIT'] }, why: str }),
  verify: strings,
});

export const DRAFT_SCHEMA = obj({ text: str });

export const INSIGHTS_SCHEMA = obj({
  headline: str,
  insights: { type: 'array', items: obj({ title: str, detail: str, tone: { type: 'string', enum: ['good', 'watch', 'risk'] }, suggestion: str }) },
  answer: str,
});

export const PHOTO_SCHEMA = obj({
  findings: { type: 'array', items: obj({ fileName: str, quality: { type: 'string', enum: ['good', 'ok', 'poor'] }, whatWeSee: str, issues: strings }) },
  severity: { type: 'string', enum: ['minor', 'moderate', 'severe', 'unclear'] },
  summary: str,
  missingShots: strings,
});
