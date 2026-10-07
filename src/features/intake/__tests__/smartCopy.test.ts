import { describe, expect, it } from 'vitest';
import type { IntakeField, ScanResult } from '../../../domain/aiTypes';
import { buildSeed } from '../../../services/seed';
import type { IntakeDraft } from '../draft';
import { applyIntakeFields, applyVerifiedPolicy, intakePolicies, startDraft, type IntakeCtx } from '../intakeApply';
import { essentials, stillNeededLabels, summaryRows } from '../smart/claimSummary';
import { attachText, examples, firstNameOf, greeting, readText, scannedTotal, snagText, unreadableText } from '../smart/copy';
import { speechProblem } from '../smart/useSpeech';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const policy = (n: string) => seed.policies.find((p) => p.policyNumber === n)!;
const ctx: IntakeCtx = { role: 'CLAIMANT', today: '2026-10-07', policies: intakePolicies(seed.policies, 'C-1001') };
const f = (key: IntakeField['key'], value: string, confidence: IntakeField['confidence'] = 'high'): IntakeField => ({ key, value, confidence });
const apply = (d: IntakeDraft, fields: IntakeField[]) => applyIntakeFields(d, fields, ctx);
const scan = (over: Partial<ScanResult> = {}): ScanResult => ({ source: 'ai', documents: [], fields: [], serviceLines: [], warnings: [], ...over });

describe('what Ease says', () => {
  it('greets by first name, dropping a doctor\'s title', () => {
    expect(firstNameOf('Maria Lopez')).toBe('Maria');
    expect(firstNameOf('Dr. Priya Shah')).toBe('Priya');
    expect(greeting('CLAIMANT', 'Maria')).toBe("Hi Maria, I'm Ease. Tell me what happened in your own words, or drop a bill or photo and I'll take it from there.");
    expect(greeting('PROVIDER', 'Priya')).toMatch(/^Hi Priya, I'm Ease\. Tell me about the visit/);
  });

  it('offers three examples to a claimant and two to a provider', () => {
    expect(examples('CLAIMANT')).toHaveLength(3);
    expect(examples('PROVIDER')).toHaveLength(2);
  });

  it('never says "AI" or uses an emoji in its own words', () => {
    const all = [greeting('CLAIMANT', 'A'), greeting('PROVIDER', 'A'), ...examples('CLAIMANT'), ...examples('PROVIDER'), readText(scan(), 3), snagText('x'), unreadableText(['a.mov'])];
    for (const t of all) {
      expect(t).not.toMatch(/\bAI\b/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('says what the person added', () => {
    expect(attachText(['bill.pdf'])).toBe("I've added bill.pdf");
    expect(attachText(['a.jpg', 'b.jpg'])).toBe("I've added a.jpg and b.jpg");
    expect(attachText(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])).toBe("I've added a.jpg, b.jpg and 2 more");
    expect(attachText(['x'.repeat(60) + '.pdf'])).toMatch(/…$|…/);
  });

  it('says what it read, the total, and how much it filled in', () => {
    const bill = scan({
      documents: [{ fileName: 'bill.pdf', documentType: 'INVOICE', summary: '' }],
      fields: [{ key: 'estimatedAmount', value: '1895', confidence: 'high', evidence: '' }],
    });
    expect(readText(bill, 12)).toBe('I read your itemized bill ($1,895). I filled in 12 things.');
    expect(readText(bill, 1)).toBe('I read your itemized bill ($1,895). I filled in 1 thing.');
    expect(readText(bill, 0)).toBe("I read your itemized bill ($1,895). I couldn't pull anything I could use from it yet.");
  });

  it('works out the total from the service lines when none is printed, and groups several documents', () => {
    const s = scan({
      documents: [
        { fileName: 'a.jpg', documentType: 'PHOTO', summary: '' },
        { fileName: 'b.jpg', documentType: 'PHOTO', summary: '' },
        { fileName: 'est.pdf', documentType: 'REPAIR_ESTIMATE', summary: '' },
      ],
      serviceLines: [
        { description: 'a', procedureCode: '1', diagnosisCode: '', units: 1, billedAmount: 245, confidence: 'high' },
        { description: 'b', procedureCode: '2', diagnosisCode: '', units: 1, billedAmount: 1650.5, confidence: 'high' },
      ],
    });
    expect(scannedTotal(s)).toBe(1895.5);
    expect(readText(s, 4)).toBe('I read your 2 photos and repair estimate ($1,895.50). I filled in 4 things.');
    expect(scannedTotal(scan())).toBeNull();
  });

  it('explains a file it cannot read but keeps', () => {
    expect(unreadableText(['clip.mov'])).toBe("I can't read clip.mov, but I've kept it with your claim.");
    expect(unreadableText(['a.mov', 'b.heic'])).toBe("I can't read a.mov and b.heic, but I've kept them with your claim.");
  });

  it('turns an error into a snag with a way forward, without doubling the full stop', () => {
    expect(snagText('You hit the free-tier limit. Wait a minute and try again.')).toBe('I hit a snag: You hit the free-tier limit. Wait a minute and try again. You can try again or use the form.');
    expect(snagText('')).toBe('I hit a snag: something went wrong. You can try again or use the form.');
  });
});

describe('voice problems', () => {
  it('say what to do instead, and say nothing when the person simply stopped', () => {
    expect(speechProblem('not-allowed')).toMatch(/microphone/);
    expect(speechProblem('service-not-allowed')).toBe(speechProblem('not-allowed'));
    expect(speechProblem('no-speech')).toMatch(/try again/);
    expect(speechProblem('network')).toMatch(/type instead/);
    expect(speechProblem('aborted')).toBe('');
    expect(speechProblem('something-new')).toMatch(/type instead/);
  });
});

describe('"Your claim so far"', () => {
  const auto = () =>
    apply(startDraft('CLAIMANT'), [
      f('policyNumber', 'POL-100245'),
      f('dateOfLoss', '2026-09-26'),
      f('description', 'Rear-ended at a red light.'),
      f('city', 'Austin'),
      f('state', 'TX'),
      f('vehicleDamage', 'Rear bumper', 'low'),
      f('drivable', 'no'),
      f('estimatedAmount', '3840.17'),
    ]);

  it('lists what was captured, in reading order, and flags what is not sure', () => {
    const rows = summaryRows(auto());
    expect(rows.map((r) => r.key)).toEqual(['dateOfLoss', 'where', 'description', 'vehicleDamage', 'drivable', 'estimatedAmount']);
    expect(rows.find((r) => r.key === 'dateOfLoss')?.value).toBe('Sep 26, 2026');
    expect(rows.find((r) => r.key === 'where')?.value).toBe('Austin, TX');
    expect(rows.find((r) => r.key === 'drivable')).toMatchObject({ label: 'Car drivable', value: 'No' });
    expect(rows.find((r) => r.key === 'vehicleDamage')?.unsure).toBe(true);
    expect(rows.find((r) => r.key === 'estimatedAmount')?.value).toBe('$3,840.17');
  });

  it('shows nothing for a fresh claim, and never shows a form default as an answer', () => {
    expect(summaryRows(startDraft('CLAIMANT'))).toEqual([]);
    const d = apply(startDraft('CLAIMANT'), [f('policyNumber', 'POL-100245')]);
    expect(summaryRows(d).map((r) => r.key)).not.toEqual(expect.arrayContaining(['drivable', 'injuries']));
  });

  it('does not show the policy address as "where"; the car from the policy shows as the vehicle', () => {
    const d = applyVerifiedPolicy(apply(startDraft('CLAIMANT'), [f('policyNumber', 'POL-100245')]), policy('POL-100245'), seed.customers[0]).draft;
    const keys = summaryRows(d).map((r) => r.key);
    expect(keys).not.toContain('where');
    expect(keys).toContain('vehicle');
    expect(summaryRows(d).find((r) => r.key === 'vehicle')?.value).toBe('2022 Toyota RAV4');
  });

  it('shows home answers and counts files', () => {
    const d = { ...apply(startDraft('CLAIMANT'), [f('policyNumber', 'POL-200318'), f('damageType', 'water'), f('habitable', 'no')]), documents: [{ key: 'a', category: 'PHOTO' as const, fileName: 'a.jpg', sizeBytes: 1, mimeType: 'image/jpeg' }] };
    const rows = summaryRows(d);
    expect(rows.find((r) => r.key === 'damageType')?.value).toMatch(/water/i);
    expect(rows.find((r) => r.key === 'habitable')).toMatchObject({ label: 'Home livable', value: 'No' });
    expect(rows.find((r) => r.key === 'documents')?.value).toBe('1 file');
  });

  it('shows a health claim as patient and services', () => {
    const base = apply(startDraft('PROVIDER'), [f('patientName', 'Maria Lopez')]);
    const d: IntakeDraft = { ...base, dateOfLoss: '2026-09-15', health: { ...base.health, lines: [{ procedureCode: '99214', diagnosisCode: '', units: 1, billedAmount: 245 }, { procedureCode: '73721', diagnosisCode: '', units: 1, billedAmount: 1650 }] } };
    const rows = summaryRows(d);
    expect(rows.find((r) => r.key === 'dateOfLoss')?.label).toBe('Date of service');
    expect(rows.find((r) => r.key === 'patientName')?.value).toBe('Maria Lopez');
    expect(rows.find((r) => r.key === 'services')?.value).toBe('2 services, $1,895 billed');
    expect(rows.find((r) => r.key === 'estimatedAmount')).toBeUndefined();
  });

  it('counts the details Ease needs, by kind of claim', () => {
    const none = essentials(startDraft('CLAIMANT'));
    expect(none.map((e) => e.key)).toEqual(['policy', 'date', 'what']); // the kind is not known yet
    expect(none.every((e) => !e.done)).toBe(true);

    const d = auto();
    const list = essentials(d);
    expect(list).toHaveLength(7);
    expect(list.filter((e) => e.done).map((e) => e.key)).toEqual(['policy', 'date', 'what', 'damage', 'drivable', 'amount']);
    expect(list.find((e) => !e.done)?.key).toBe('injuries');

    expect(essentials(apply(startDraft('CLAIMANT'), [f('policyNumber', 'POL-200318')]))).toHaveLength(6);
    expect(essentials(startDraft('PROVIDER'))).toHaveLength(4);
  });

  it('adds the policy or the date to "Still needed" when our own check threw them away', () => {
    const d = startDraft('CLAIMANT');
    expect(stillNeededLabels(['What happened'], d, false)).toEqual(['Which policy', 'Date it happened', 'What happened']);
    expect(stillNeededLabels(['Which policy', 'Date it happened'], d, false)).toEqual(['Which policy', 'Date it happened']);
    const withPolicy = { ...d, policyNumber: 'POL-100245' };
    expect(stillNeededLabels(['What happened'], withPolicy, false)).toEqual(['Date it happened', 'What happened']);
    expect(stillNeededLabels([], { ...withPolicy, dateOfLoss: '2026-09-26' }, false)).toEqual([]);
    expect(stillNeededLabels(['Anything'], d, true)).toEqual([]);
  });
});
