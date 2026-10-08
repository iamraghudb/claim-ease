import { describe, expect, it, vi } from 'vitest';
import type { IntakeRequest, StaffClaimContext } from '../../src/domain/aiTypes';
import { isAllowedPath } from '../../src/domain/aiRoutes';
import { createHandlers } from '../handlers';
import { BRIEF_SYSTEM, copilotSystem, INTAKE_SYSTEM } from '../prompts';
import type { Complete } from '../types';

const b64 = (s: string) => Buffer.from(s).toString('base64');

function fake(answer: unknown) {
  const complete = vi.fn<Complete>().mockResolvedValue(answer);
  return { complete, handlers: createHandlers({ complete, model: 'm' }) };
}
const demo = createHandlers({ complete: null, model: 'm' });

// ---------- route allow-list ----------

describe('isAllowedPath', () => {
  it('allows real pages for the role and nothing else', () => {
    expect(isAllowedPath('CLAIMANT', '/file/smart')).toBe(true);
    expect(isAllowedPath('CLAIMANT', '/claims/CLM-2026-000103')).toBe(true);
    expect(isAllowedPath('CLAIMANT', '/queue')).toBe(false); // staff page
    expect(isAllowedPath('ADJUSTER', '/queue/CLM-2026-000103')).toBe(true);
    expect(isAllowedPath('ADMIN', '/admin/config')).toBe(true);
    expect(isAllowedPath('CLAIMANT', '/admin')).toBe(false);
  });
  it('rejects look-alikes, external links and script injection', () => {
    for (const p of ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '/claims/../admin', '/claims/CLM-2026-0001', '/file/smart?x=1', '/claims/CLM-2026-000103/file/extra']) {
      expect(isAllowedPath('CLAIMANT', p)).toBe(false);
    }
  });
});

// ---------- copilot ----------

const page = { path: '/claims/CLM-2026-000103', title: 'Claim CLM-2026-000103', summary: 'A claim tracker.', data: { status: 'Under review' }, suggestions: ['What next?'] };

describe('copilot', () => {
  it('puts the screen, the conversation and the question in one message, with a role-aware system prompt', async () => {
    const { complete, handlers } = fake({ answer: 'Upload the estimate.', followUps: ['a', 'b', 'c', 'd'], actions: [] });
    const r = await handlers.copilot({ role: 'CLAIMANT', page, question: 'What next?', history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }, { role: 'system', text: 'dropped' }] });
    const args = complete.mock.calls[0][0];
    expect(args.system).toBe(copilotSystem('CLAIMANT'));
    expect(args.system).toContain('/file/smart');
    expect(args.system).not.toContain('/admin/config'); // a claimant is never told about admin pages
    const text = (args.parts[0] as { text: string }).text;
    expect(text).toContain('<screen>');
    expect(text).toContain('Under review');
    expect(text).toContain('Person: hi');
    expect(text).toContain('Ease: hello');
    expect(text).not.toContain('dropped');
    expect(r.followUps).toHaveLength(3);
  });

  it('drops any action that points outside the app or to a page the role cannot see', async () => {
    const { handlers } = fake({
      answer: 'Go here.',
      followUps: [],
      actions: [
        { label: 'My claims', to: '/claims' },
        { label: 'Evil', to: 'https://evil.example/' },
        { label: 'Admin', to: '/admin' },
        { label: '', to: '/file' },
        { label: 'Third', to: '/notifications' },
        { label: 'Fourth', to: '/glossary' },
      ],
    });
    const r = await handlers.copilot({ role: 'CLAIMANT', page, question: 'x', history: [] });
    expect(r.actions.map((a) => a.to)).toEqual(['/claims', '/notifications']); // allowed only, at most 2
  });

  it('validates the request and rejects an empty answer', async () => {
    const { handlers } = fake({ answer: '', followUps: [], actions: [] });
    await expect(handlers.copilot({ role: 'WIZARD', page, question: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(handlers.copilot({ role: 'CLAIMANT', question: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(handlers.copilot({ role: 'CLAIMANT', page, question: '  ' })).rejects.toMatchObject({ status: 400 });
    await expect(handlers.copilot({ role: 'CLAIMANT', page, question: 'x' })).rejects.toMatchObject({ status: 502 });
  });

  it('answers in demo mode without a key', async () => {
    const r = await demo.copilot({ role: 'ADJUSTER', page: { ...page, path: '/queue/CLM-2026-000103', summary: 'Claim review.' }, question: 'help', history: [] });
    expect(r.source).toBe('demo');
    expect(r.actions.every((a) => isAllowedPath('ADJUSTER', a.to))).toBe(true);
  });
});

// ---------- Smart start ----------

const policies = [
  { policyNumber: 'POL-100245', type: 'AUTO' as const, label: 'Auto, Toyota RAV4' },
  { policyNumber: 'POL-200318', type: 'HOME' as const, label: 'Home' },
  { policyNumber: 'POL-300577', type: 'HEALTH' as const, label: 'Health plan' },
];
const intakeBody = (conversation: { role: string; text: string }[], over: Record<string, unknown> = {}) => ({ role: 'CLAIMANT', today: '2026-10-07', policies, known: {}, documents: [], conversation, ...over });

describe('intake (Smart start)', () => {
  it('sends today, policies, what is known and the conversation', async () => {
    const { complete, handlers } = fake({ reply: 'Got it. Anyone hurt?', fields: [], quickReplies: [], done: false, stillNeeded: [] });
    await handlers.intake(intakeBody([{ role: 'user', text: 'I was rear-ended yesterday' }], { known: { description: 'x' } }));
    const args = complete.mock.calls[0][0];
    expect(args.system).toBe(INTAKE_SYSTEM);
    const text = (args.parts[0] as { text: string }).text;
    expect(text).toContain('2026-10-07');
    expect(text).toContain('POL-100245');
    expect(text).toContain('Person: I was rear-ended yesterday');
  });

  it('accepts a conversation that ends with Ease\'s recap of a file it just read', async () => {
    const { handlers } = fake({ reply: 'Was anyone hurt?', fields: [], quickReplies: [], done: false, stillNeeded: [] });
    const r = await handlers.intake(intakeBody([{ role: 'user', text: 'I\'ve added police.png' }, { role: 'assistant', text: 'I read your police report. I filled in 10 things.' }]));
    expect(r.reply).toBe('Was anyone hurt?');
  });

  it('keeps only valid, well-formed fields', async () => {
    const { handlers } = fake({
      reply: 'Thanks.',
      fields: [
        { key: 'policyNumber', value: 'pol-100245', confidence: 'high' },
        { key: 'dateOfLoss', value: '2026-10-06', confidence: 'high' },
        { key: 'dateOfLoss', value: '2027-01-01', confidence: 'high' }, // future: dropped
        { key: 'state', value: 'tx', confidence: 'high' },
        { key: 'state', value: 'Texas', confidence: 'high' }, // not a code: dropped
        { key: 'estimatedAmount', value: '$3,840.17', confidence: 'medium' },
        { key: 'incidentType', value: 'collision', confidence: 'high' },
        { key: 'incidentType', value: 'ALIEN', confidence: 'high' }, // unknown enum: dropped
        { key: 'drivable', value: 'Yes', confidence: 'high' },
        { key: 'injuries', value: 'maybe', confidence: 'low' }, // not yes/no: dropped
        { key: 'nonsense', value: 'x', confidence: 'high' },
      ],
      quickReplies: ['Yes', 'No', 'Maybe', 'Skip', 'Extra'],
      done: false,
      stillNeeded: [],
    });
    const r = await handlers.intake(intakeBody([{ role: 'user', text: 'x' }]));
    expect(r.fields).toEqual([
      { key: 'policyNumber', value: 'POL-100245', confidence: 'high' },
      { key: 'dateOfLoss', value: '2026-10-06', confidence: 'high' },
      { key: 'state', value: 'TX', confidence: 'high' },
      { key: 'estimatedAmount', value: '3840.17', confidence: 'medium' },
      { key: 'incidentType', value: 'COLLISION', confidence: 'high' },
      { key: 'drivable', value: 'yes', confidence: 'high' },
    ]);
    expect(r.quickReplies).toHaveLength(4);
  });

  it("rejects a policy number that is not one of the person's own", async () => {
    const { handlers } = fake({ reply: 'ok', fields: [{ key: 'policyNumber', value: 'POL-999999', confidence: 'high' }], quickReplies: [], done: false, stillNeeded: [] });
    expect((await handlers.intake(intakeBody([{ role: 'user', text: 'x' }]))).fields).toEqual([]);
  });

  it('never says "done" until the essentials are known, and lists what is missing', async () => {
    const eager = { reply: 'All done!', fields: [{ key: 'policyNumber', value: 'POL-100245', confidence: 'high' }], quickReplies: [], done: true, stillNeeded: [] };
    const r = await fake(eager).handlers.intake(intakeBody([{ role: 'user', text: 'x' }]));
    expect(r.done).toBe(false);
    expect(r.stillNeeded).toEqual(expect.arrayContaining(['Date it happened', 'What happened', 'What was damaged']));
  });

  it('picks the only matching policy itself, and fixes a reply that still asks which one', async () => {
    const asksWhich = { reply: 'So sorry. Which of your policies should we use?', fields: [{ key: 'vehicleDamage', value: 'Bumper', confidence: 'high' }, { key: 'drivable', value: 'yes', confidence: 'high' }], quickReplies: ['Auto', 'Home'], done: false, stillNeeded: ['policyNumber'] };
    const r = await fake(asksWhich).handlers.intake(intakeBody([{ role: 'user', text: 'I was rear-ended' }]));
    expect(r.fields.find((f) => f.key === 'policyNumber')?.value).toBe('POL-100245'); // the only auto policy
    expect(r.reply).not.toMatch(/which of your/i);
    expect(r.reply).toContain('Auto, Toyota RAV4');
    expect(r.reply).toMatch(/when did it happen/i); // and moves on to the next question
  });

  it('fixes the reply and drops policy buttons when the model chose the policy but still asked which one', async () => {
    const both = { reply: 'So sorry. Which of your policies should we use?', fields: [{ key: 'policyNumber', value: 'POL-100245', confidence: 'high' }, { key: 'vehicleDamage', value: 'Bumper', confidence: 'high' }], quickReplies: ['Auto, Toyota RAV4', 'Home', 'Yes'], done: false, stillNeeded: [] };
    const r = await fake(both).handlers.intake(intakeBody([{ role: 'user', text: 'I was rear-ended' }]));
    expect(r.reply).not.toMatch(/which of your/i);
    expect(r.reply).toContain('Auto, Toyota RAV4');
    expect(r.quickReplies).toEqual(['Yes']);
  });

  it('does not re-confirm a policy that is already chosen, however the model words it', async () => {
    const known = { policyNumber: 'POL-100245', dateOfLoss: '2026-10-02', description: 'Rear-ended', vehicleDamage: 'Rear bumper', drivable: 'no', injuries: 'no', amountClaimed: '4500' };
    const r = await fake({ reply: 'Since you have both an auto policy and other coverage, is this for your Toyota RAV4?', fields: [], quickReplies: [], done: true, stillNeeded: [] }).handlers.intake(intakeBody([{ role: 'user', text: 'about 4500' }], { known }));
    expect(r.reply).not.toMatch(/is this for/i);
    expect(r.reply).toContain('Auto, Toyota RAV4');
  });

  it('does not guess a policy when two could fit', async () => {
    const twoAutos = [...policies, { policyNumber: 'POL-100999', type: 'AUTO' as const, label: 'Auto, Honda Civic' }];
    const r = await fake({ reply: 'Which car was it?', fields: [{ key: 'vehicleDamage', value: 'Bumper', confidence: 'high' }], quickReplies: [], done: false, stillNeeded: [] }).handlers.intake(intakeBody([{ role: 'user', text: 'my bumper' }], { policies: twoAutos }));
    expect(r.fields.some((f) => f.key === 'policyNumber')).toBe(false);
    expect(r.reply).toBe('Which car was it?');
  });

  it('reports what is still needed in plain words, never as field names', async () => {
    const r = await fake({ reply: 'Thanks.', fields: [], quickReplies: [], done: false, stillNeeded: ['policyNumber', 'habitable'] }).handlers.intake(intakeBody([{ role: 'user', text: 'hi' }]));
    expect(r.stillNeeded).not.toContain('policyNumber');
    expect(r.stillNeeded.every((x) => /^[A-Z]/.test(x) && x.includes(' '))).toBe(true);
  });

  it('keeps asking for a rough amount until the model says it is done', async () => {
    const known = { policyNumber: 'POL-100245', dateOfLoss: '2026-10-06', description: 'Rear-ended', vehicleDamage: 'Rear bumper', drivable: 'yes', injuries: 'no' };
    const r = await fake({ reply: 'Thanks, I will use your Auto, Toyota RAV4 policy. Which of your policies is it?', fields: [], quickReplies: [], done: false, stillNeeded: [] }).handlers.intake(intakeBody([{ role: 'user', text: 'no' }], { known }));
    expect(r.done).toBe(false);
    expect(r.stillNeeded).toEqual(['A rough amount']);
  });

  it('is done when an auto claim has everything', async () => {
    const known = { policyNumber: 'POL-100245', dateOfLoss: '2026-10-06', description: 'Rear-ended', vehicleDamage: 'Rear bumper', drivable: 'yes' };
    const r = await fake({ reply: 'Thanks.', fields: [{ key: 'injuries', value: 'no', confidence: 'high' }], quickReplies: [], done: true, stillNeeded: ['stale'] }).handlers.intake(intakeBody([{ role: 'user', text: 'no' }], { known }));
    expect(r.done).toBe(true);
    expect(r.stillNeeded).toEqual([]);
  });

  it('validates the request', async () => {
    const { handlers } = fake({});
    await expect(handlers.intake(intakeBody([]))).rejects.toMatchObject({ status: 400 });
    await expect(handlers.intake(intakeBody([{ role: 'assistant', text: 'hi' }]))).rejects.toMatchObject({ status: 400 });
    await expect(handlers.intake(intakeBody([{ role: 'user', text: 'x' }], { today: 'tomorrow' }))).rejects.toMatchObject({ status: 400 });
  });

  describe('demo script', () => {
    const turn = (known: Record<string, string>, text: string, role = 'CLAIMANT'): IntakeRequest =>
      ({ role, today: '2026-10-07', policies, known, documents: [], conversation: [{ role: 'user', text }] }) as IntakeRequest;

    it('works out the kind of claim and the policy from the first message, then asks one question at a time', async () => {
      const first = await demo.intake(turn({}, 'I was rear-ended yesterday and my bumper is wrecked'));
      expect(first.source).toBe('demo');
      expect(first.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['policyNumber', 'dateOfLoss', 'description', 'vehicleDamage']));
      expect(first.fields.find((f) => f.key === 'policyNumber')?.value).toBe('POL-100245');
      expect(first.fields.find((f) => f.key === 'dateOfLoss')?.value).toBe('2026-10-06');
      expect(first.reply).toMatch(/drivable/i);
      expect(first.done).toBe(false);
    });

    it('can be walked to done', async () => {
      let known: Record<string, string> = { claimType: 'AUTO', policyNumber: 'POL-100245', dateOfLoss: '2026-10-06', description: 'Rear-ended', vehicleDamage: 'bumper' };
      for (const answer of ['Yes', 'No', '$3,800']) {
        const r = await demo.intake(turn(known, answer));
        for (const f of r.fields) known = { ...known, [f.key]: f.value };
        if (r.done) return expect(known).toMatchObject({ drivable: 'yes', injuries: 'no', estimatedAmount: '3800' });
      }
      throw new Error('demo script never finished');
    });

    it('asks a provider for the plan number', async () => {
      const r = await demo.intake({ ...turn({}, 'We saw a patient for knee pain, here is the bill'), role: 'PROVIDER', policies: [] });
      expect(r.reply).toMatch(/which policy/i);
    });
  });
});

// ---------- staff brief ----------

const ctx = (over: Partial<StaffClaimContext> = {}): StaffClaimContext => ({
  claimType: 'AUTO',
  status: 'Under review',
  statusMeaning: 'An adjuster is reviewing.',
  description: 'Rear-ended.',
  dateOfLoss: '2026-09-26',
  amountClaimed: 3840,
  estimatedFields: [],
  uncertaintyScore: 20,
  complexity: 'LOW',
  priority: 'NORMAL',
  fastTrackEligible: true,
  checks: [{ label: 'Policy active', status: 'PASS', explanation: 'ok' }],
  triggers: [],
  payable: { claimed: 3840, allowed: 3840, deductible: 500, copay: 0, coinsurance: 0, limitReduction: 0, payable: 3340, claimantResponsibility: 500 },
  documents: [],
  openInfoRequests: 0,
  notes: [],
  experts: [],
  ...over,
});

describe('brief', () => {
  const answer = (action: string) => ({ headline: 'Rear-end claim', summary: 's', risks: [{ title: 'r', plain: 'p', severity: 'high' }], recommended: { action, why: 'w' }, verify: ['a', 'b', 'c', 'd'] });

  it('sends the snapshot and returns a clean brief', async () => {
    const { complete, handlers } = fake(answer('APPROVE'));
    const r = await handlers.brief({ context: ctx() });
    expect(complete.mock.calls[0][0].system).toBe(BRIEF_SYSTEM);
    expect(r.recommended.action).toBe('APPROVE');
    expect(r.verify).toHaveLength(3);
  });

  it('lets the rules engine have the last word', async () => {
    const failing = ctx({ checks: [{ label: 'Coverage', status: 'FAIL', explanation: 'excluded' }] });
    expect((await fake(answer('APPROVE')).handlers.brief({ context: failing })).recommended.action).toBe('INVESTIGATE');
    expect((await fake(answer('PARTIALLY_APPROVE')).handlers.brief({ context: failing })).recommended.action).toBe('INVESTIGATE');
    expect((await fake(answer('DENY')).handlers.brief({ context: ctx() })).recommended.action).toBe('INVESTIGATE'); // no failed check: cannot deny
    expect((await fake(answer('DENY')).handlers.brief({ context: failing })).recommended.action).toBe('DENY');
  });

  it('fixes an unknown action and severity', async () => {
    const r = await fake({ ...answer('SHRUG'), risks: [{ title: 'r', plain: 'p', severity: 'catastrophic' }] }).handlers.brief({ context: ctx() });
    expect(r.recommended.action).toBe('WAIT');
    expect(r.risks[0].severity).toBe('medium');
  });

  it('demo mode works the advice out from the checks', async () => {
    expect((await demo.brief({ context: ctx() })).recommended.action).toBe('APPROVE');
    expect((await demo.brief({ context: ctx({ checks: [{ label: 'Coverage', status: 'FAIL', explanation: 'excluded' }] }) })).recommended.action).toBe('INVESTIGATE');
    expect((await demo.brief({ context: ctx({ openInfoRequests: 1 }) })).recommended.action).toBe('WAIT');
    expect((await demo.brief({ context: ctx({ triggers: [{ label: 'Missing documents', explanation: 'no estimate' }] }) })).recommended.action).toBe('REQUEST_INFO');
  });
});

// ---------- drafts ----------

describe('draft', () => {
  it('uses the right instructions for each kind and returns the text', async () => {
    const { complete, handlers } = fake({ text: 'Dear team, I disagree.' });
    const r = await handlers.draft({ kind: 'appeal_letter', context: { reason: 'Excluded' }, notes: 'The dent was from the storm' });
    const args = complete.mock.calls[0][0];
    expect(args.system).toContain('appeal letter');
    expect((args.parts[0] as { text: string }).text).toContain('The dent was from the storm');
    expect(r).toEqual({ source: 'ai', text: 'Dear team, I disagree.' });
  });

  it('rejects an unknown kind and an empty draft', async () => {
    await expect(fake({}).handlers.draft({ kind: 'poem', context: {} })).rejects.toMatchObject({ status: 400 });
    await expect(fake({ text: '' }).handlers.draft({ kind: 'cost_explanation', context: {} })).rejects.toMatchObject({ status: 502 });
  });

  it('has a template for every kind in demo mode', async () => {
    for (const kind of ['decision_explanation', 'info_request_message', 'appeal_letter', 'cost_explanation']) {
      const r = await demo.draft({ kind, context: { outcome: 'DENIED', approvedAmount: 0, items: ['A', 'B'], billed: 1895, allowed: 1015, planPaid: 575, patientResponsibility: 440 } });
      expect(r.source).toBe('demo');
      expect(r.text.length).toBeGreaterThan(40);
    }
  });
});

// ---------- insights ----------

const stats = { totalClaims: 10, decided: 5, avgDaysToDecision: 3.6, fastTrackPct: 60, needInfoPct: 10, denialPct: 20, appeals: 0, byStatus: {}, byType: {}, topDelayReasons: [{ reason: 'Missing information', count: 3 }], slaAtRisk: 1, slaOverdue: 0 };

describe('insights', () => {
  it('passes the stats and an optional question', async () => {
    const { complete, handlers } = fake({ headline: 'h', insights: Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, detail: 'd', tone: 'sparkly', suggestion: 's' })), answer: 'Because.' });
    const r = await handlers.insights({ stats, question: 'Why so slow?', history: [] });
    expect((complete.mock.calls[0][0].parts[0] as { text: string }).text).toContain('Why so slow?');
    expect(r.insights).toHaveLength(4);
    expect(r.insights[0].tone).toBe('watch');
    expect(r.answer).toBe('Because.');
  });

  it('never lets a code-style field name reach the screen', async () => {
    const { handlers } = fake({ headline: 'Calm week.', insights: [{ title: 'Clean record', detail: 'Both slaAtRisk and slaOverdue are at zero, while fastTrackPct is high.', tone: 'good', suggestion: 'Keep going.' }], answer: 'Check slaOverdue first, on your iPhone.' });
    const r = await handlers.insights({ stats, question: 'How are we doing?', history: [] });
    expect(r.insights[0].detail).toBe('Both SLA at risk and SLA overdue are at zero, while fast track pct is high.');
    expect(r.answer).toBe('Check SLA overdue first, on your iPhone.');
  });

  it('demo mode summarises the numbers', async () => {
    const r = await demo.insights({ stats });
    expect(r.headline).toContain('10 claims');
    expect(r.insights.some((i) => i.detail.includes('Missing information'))).toBe(true);
  });
});

// ---------- photo check ----------

describe('photo', () => {
  const photo = { fileName: 'bumper.jpg', mimeType: 'image/jpeg', data: b64('jpg') };

  it('sends images and cleans the answer', async () => {
    const { complete, handlers } = fake({ findings: [{ fileName: 'bumper.jpg', quality: 'blurry', whatWeSee: 'A dented bumper.', issues: ['blurry'] }], severity: 'moderate', summary: 's', missingShots: ['a', 'b', 'c', 'd', 'e'] });
    const r = await handlers.photo({ claimType: 'AUTO', photos: [photo] });
    expect(complete.mock.calls[0][0].parts.map((p) => p.kind)).toEqual(['text', 'file', 'text']);
    expect(r.findings[0].quality).toBe('ok'); // unknown quality becomes "ok"
    expect(r.severity).toBe('moderate');
    expect(r.missingShots).toHaveLength(4);
  });

  it('only accepts photos', async () => {
    const { handlers } = fake({});
    await expect(handlers.photo({ claimType: 'AUTO', photos: [{ ...photo, mimeType: 'application/pdf' }] })).rejects.toMatchObject({ status: 400 });
    await expect(handlers.photo({ claimType: 'AUTO', photos: [] })).rejects.toMatchObject({ status: 400 });
    await expect(handlers.photo({ claimType: 'BOAT', photos: [photo] })).rejects.toMatchObject({ status: 400 });
  });

  it('gives suggestions in demo mode', async () => {
    const r = await demo.photo({ claimType: 'AUTO', photos: [photo] });
    expect(r.source).toBe('demo');
    expect(r.missingShots.length).toBeGreaterThan(0);
  });
});

// ---------- scan with an unknown claim type ----------

describe('scan with claimType UNKNOWN', () => {
  const doc = { fileName: 'bill.pdf', mimeType: 'application/pdf', data: b64('%PDF') };

  it('asks the model to decide the type and trusts a valid guess', async () => {
    const { complete, handlers } = fake({
      claimType: 'HEALTH',
      documents: [{ fileName: 'bill.pdf', documentType: 'INVOICE', summary: 'A bill.' }],
      fields: [{ key: 'memberId', value: 'MBR-1', confidence: 'high', evidence: 'x' }, { key: 'vehicleVin', value: 'drop?', confidence: 'high', evidence: '' }],
      serviceLines: [{ description: 'Visit', procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245, confidence: 'high' }],
      warnings: [],
    });
    const r = await handlers.scan({ claimType: 'UNKNOWN', documents: [doc] });
    expect(JSON.stringify(complete.mock.calls[0][0].parts.at(-1))).toContain('not known yet');
    expect(r.claimTypeGuess).toBe('HEALTH');
    expect(r.fields.map((f) => f.key)).toEqual(['memberId']); // vehicleVin is not a health field
    expect(r.serviceLines).toHaveLength(1);
  });

  it('has no guess when the model cannot tell', async () => {
    const r = await fake({ claimType: 'UNKNOWN', documents: [], fields: [], serviceLines: [], warnings: [] }).handlers.scan({ claimType: 'UNKNOWN', documents: [doc] });
    expect(r.claimTypeGuess).toBeUndefined();
    expect(r.serviceLines).toEqual([]);
  });

  it('is treated as a health bill in demo mode', async () => {
    expect((await demo.scan({ claimType: 'UNKNOWN', documents: [doc] })).claimTypeGuess).toBe('HEALTH');
  });
});
