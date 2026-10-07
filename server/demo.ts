// Demo mode: what the AI endpoints return when there is no API key.
// Every result is tagged source: 'demo' and the UI shows a "Demo data" badge, so nobody mistakes
// it for a real model reading their file. It exists so the whole flow can be built, tested and
// shown before a key is configured.

import type { DraftContext, ExplainRequest, ExplainResult, ExtractedField, GapCheckResult, GapItem, ScanRequest, ScanResult } from '../src/domain/aiTypes';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const f = (key: ExtractedField['key'], value: string, confidence: ExtractedField['confidence'] = 'high', evidence = 'Sample value'): ExtractedField => ({
  key,
  value,
  confidence,
  evidence,
});

const DEMO_WARNING = 'Demo mode: these are sample values, not read from your file. Add GEMINI_API_KEY to .env.local to use the real AI.';

export function demoScan(req: ScanRequest): ScanResult {
  // With no AI there is nothing to classify the documents, so an unknown type is treated as a health bill.
  const claimType = req.claimType === 'UNKNOWN' ? 'HEALTH' : req.claimType;
  const guess = req.claimType === 'UNKNOWN' ? { claimTypeGuess: 'HEALTH' as const } : {};
  const documents = req.documents.map((d) => ({
    fileName: d.fileName,
    documentType: claimType === 'HEALTH' ? ('INVOICE' as const) : ('REPAIR_ESTIMATE' as const),
    summary: 'Sample document summary (demo data).',
  }));

  if (claimType === 'HEALTH')
    return {
      source: 'demo',
      ...guess,
      documents,
      fields: [
        f('patientName', 'Maria Lopez'),
        f('patientDob', '1988-04-12'),
        f('memberId', 'MBR-778812'),
        f('providerName', 'Lakeside Medical Group'),
        f('providerNpi', '1234567893'),
        f('providerTaxId', '74-1234567', 'medium'),
        f('dateOfLoss', daysAgo(21)),
        f('city', 'Austin'),
        f('state', 'TX'),
        f('description', 'Office visit and MRI of the right knee for knee pain.', 'medium'),
      ],
      serviceLines: [
        { description: 'Office visit, established patient', procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245, confidence: 'high' },
        { description: 'MRI right knee without contrast', procedureCode: '73721', diagnosisCode: 'S83.241A', units: 1, billedAmount: 1650, confidence: 'medium' },
      ],
      warnings: [DEMO_WARNING],
    };

  if (claimType === 'AUTO')
    return {
      source: 'demo',
      documents,
      fields: [
        f('vehicleYear', '2022'),
        f('vehicleMake', 'Toyota'),
        f('vehicleModel', 'RAV4'),
        f('vehicleVin', '2T3P1RFV8NW123456'),
        f('vehicleDamage', 'Rear bumper cover, tail lamp', 'medium'),
        f('estimatedAmount', '3840.17'),
        f('dateOfLoss', daysAgo(8)),
        f('description', 'Rear-ended while stopped at a traffic light; rear bumper and tail lamp damaged.', 'low'),
      ],
      serviceLines: [],
      warnings: [DEMO_WARNING],
    };

  return {
    source: 'demo',
    documents,
    fields: [
      f('areasAffected', 'Kitchen, hallway', 'medium'),
      f('contractorName', 'Acme Restoration'),
      f('estimatedAmount', '6200'),
      f('dateOfLoss', daysAgo(8)),
      f('description', 'Burst pipe under the kitchen sink flooded the kitchen floor and hallway.', 'low'),
    ],
    serviceLines: [],
    warnings: [DEMO_WARNING],
  };
}

/** Not fake AI: it simply restates the app's own checklist, so the flow is testable offline. */
export function demoGaps(ctx: DraftContext): GapCheckResult {
  const items: GapItem[] = ctx.checklist
    .filter((c) => !c.satisfied)
    .map((c) => ({
      severity: c.required ? ('blocker' as const) : ('recommended' as const),
      title: c.label,
      why: c.required ? 'The insurer cannot start the review without this.' : 'Not required, but claims that include it are usually processed faster.',
      action: `Add: ${c.label.toLowerCase()}.`,
    }));
  const blockers = items.filter((i) => i.severity === 'blocker').length;
  return {
    source: 'demo',
    readyToSubmit: blockers === 0,
    headline: blockers === 0 ? 'Everything required is in. You can submit.' : `${blockers} required item${blockers === 1 ? ' is' : 's are'} still missing.`,
    items: items.slice(0, 6),
  };
}

export function demoExplain(req: ExplainRequest): ExplainResult {
  const c = req.context;
  const needed = c.openRequests.flatMap((r) => r.stillNeeded);
  const parts = [`Your claim is "${c.status}". ${c.statusMeaning}`];
  if (needed.length) parts.push(`We still need from you: ${needed.join(', ')}.`);
  parts.push(`Time window: ${c.sla.summary}.`);
  return { source: 'demo', answer: parts.join(' '), followUps: ['What happens next?', 'How long will this take?'] };
}
