import { describe, expect, it } from 'vitest';
import type { Confidence, ExtractedField, ExtractedLine, IntakeField, IntakeKey, ScanResult } from '../../../domain/aiTypes';
import type { Customer, Policy } from '../../../domain/types';
import { buildSeed } from '../../../services/seed';
import { applyPolicy, emptyDraft, type IntakeDraft } from '../draft';
import {
  applyIntakeFields,
  applyScanToDraft,
  applyVerifiedPolicy,
  capturedLabels,
  catchUpScan,
  checkPolicy,
  finalizeDraft,
  intakeKnown,
  intakePolicies,
  isRealDate,
  startDraft,
  stepForDraft,
  type IntakeCtx,
  type PolicyLookup,
} from '../intakeApply';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const policy = (n: string) => seed.policies.find((p) => p.policyNumber === n)!;
const customer = seed.customers[0];

const ctx: IntakeCtx = { role: 'CLAIMANT', today: '2026-10-07', policies: intakePolicies(seed.policies, 'C-1001') };
const providerCtx: IntakeCtx = { role: 'PROVIDER', today: '2026-10-07', policies: [] };

const f = (key: IntakeKey, value: string, confidence: Confidence = 'high'): IntakeField => ({ key, value, confidence });
const apply = (d: IntakeDraft, fields: IntakeField[], c: IntakeCtx = ctx) => applyIntakeFields(d, fields, c);
const fresh = () => startDraft('CLAIMANT');
/** The draft after the policy lookup has succeeded. */
const verified = (d: IntakeDraft, number: string) => applyVerifiedPolicy({ ...d, policyNumber: number }, policy(number), customer).draft;

describe('intakePolicies', () => {
  it("lists only the person's ACTIVE policies, with a label Ease can say out loud", () => {
    const list = intakePolicies(seed.policies, 'C-1001');
    expect(list).toEqual([
      { policyNumber: 'POL-100245', type: 'AUTO', label: 'Auto, Toyota RAV4' },
      { policyNumber: 'POL-200318', type: 'HOME', label: 'Home, 418 Maple Ave, Austin, TX 78704' },
      { policyNumber: 'POL-300577', type: 'HEALTH', label: 'Health plan' },
    ]);
  });

  it('skips lapsed policies and other people\'s', () => {
    expect(intakePolicies(seed.policies, 'C-1002')).toEqual([]); // David's only policy has lapsed
    expect(intakePolicies(seed.policies, undefined)).toEqual([]);
  });

  it('labels a renters policy and falls back to the bare type', () => {
    const renters: Policy = { ...policy('POL-200318'), policyNumber: 'POL-500001', type: 'RENTERS', propertyAddress: '9 Elm St, Dallas, TX 75201' };
    const bare: Policy = { ...policy('POL-100245'), policyNumber: 'POL-500002', vehicles: undefined };
    expect(intakePolicies([renters, bare], 'C-1001').map((p) => p.label)).toEqual(['Renters, 9 Elm St, Dallas, TX 75201', 'Auto']);
  });
});

describe('isRealDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isRealDate('2026-09-26')).toBe(true);
    expect(isRealDate('2026-02-31')).toBe(false);
    expect(isRealDate('26/09/2026')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
});

describe('applyIntakeFields: policy and date', () => {
  it('takes the policy number and the date, and works out the kind of claim from the policy', () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-200318'), f('dateOfLoss', '2026-09-26')]);
    expect(d).toMatchObject({ policyNumber: 'POL-200318', dateOfLoss: '2026-09-26', claimType: 'PROPERTY' });
    expect(d.policy).toBeUndefined(); // looked up afterwards
    expect(d.captured).toEqual(expect.arrayContaining(['claimType', 'policyNumber', 'dateOfLoss']));
  });

  it('tidies a policy number written loosely', () => {
    expect(apply(fresh(), [f('policyNumber', 'pol100245')]).policyNumber).toBe('POL-100245');
  });

  it("refuses a policy that is not one of the person's own, but a provider may type any plan number", () => {
    expect(apply(fresh(), [f('policyNumber', 'POL-400112')]).policyNumber).toBe('');
    expect(apply(startDraft('PROVIDER'), [f('policyNumber', 'POL-300577')], providerCtx).policyNumber).toBe('POL-300577');
    expect(apply(startDraft('PROVIDER'), [f('policyNumber', 'POL-3005')], providerCtx).policyNumber).toBe('');
  });

  it('refuses a date that does not exist, is not written YYYY-MM-DD, or is in the future', () => {
    for (const bad of ['2026-02-31', 'yesterday', '2026-10-08', '2099-01-01']) expect(apply(fresh(), [f('dateOfLoss', bad)]).dateOfLoss).toBe('');
    expect(apply(fresh(), [f('dateOfLoss', '2026-10-07')]).dateOfLoss).toBe('2026-10-07'); // today is fine
  });

  it('switching to another policy, or correcting the date, asks for the policy to be verified again', () => {
    let d = verified(apply(fresh(), [f('policyNumber', 'POL-100245'), f('dateOfLoss', '2026-09-25')]), 'POL-100245');
    expect(d.policy?.policyNumber).toBe('POL-100245');

    const sameDay = apply(d, [f('dateOfLoss', '2026-09-25')]);
    expect(sameDay.policy).toBeDefined(); // nothing changed, nothing to redo

    d = apply(d, [f('dateOfLoss', '2026-09-26')]);
    expect(d).toMatchObject({ dateOfLoss: '2026-09-26', policyNumber: 'POL-100245' });
    expect(d.policy).toBeUndefined();

    const other = apply(verified(d, 'POL-100245'), [f('policyNumber', 'POL-200318')]);
    expect(other).toMatchObject({ policyNumber: 'POL-200318', claimType: 'PROPERTY' });
    expect(other.policy).toBeUndefined();
  });
});

describe('applyIntakeFields: answers', () => {
  it('turns yes and no into booleans for auto', () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-100245'), f('drivable', 'no'), f('injuries', 'yes')]);
    expect(d.auto).toMatchObject({ drivable: false, injuries: true });
    expect(apply(d, [f('drivable', 'Yes'), f('injuries', 'NO')]).auto).toMatchObject({ drivable: true, injuries: false });
  });

  it('applies the home answers to the property details', () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-200318'), f('damageType', 'water'), f('habitable', 'no'), f('areasAffected', 'Kitchen ceiling'), f('estimatedAmount', '$2,500')]);
    expect(d.claimType).toBe('PROPERTY');
    expect(d.property).toMatchObject({ damageType: 'WATER', habitable: false, areasAffected: 'Kitchen ceiling' });
    expect(d.estimatedAmount).toBe('2500');
  });

  it('takes the incident type from the same list the form uses', () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-100245'), f('incidentType', 'hit_and_run')]);
    expect(d.auto.incidentType).toBe('HIT_AND_RUN');
    expect(apply(d, [f('incidentType', 'EXPLOSION')]).auto.incidentType).toBe('HIT_AND_RUN');
  });

  it('works out the kind of claim from the facts when there is no policy yet', () => {
    expect(apply(fresh(), [f('damageType', 'FIRE')]).claimType).toBe('PROPERTY');
    expect(apply(fresh(), [f('vehicleMake', 'Honda')]).claimType).toBe('AUTO');
    expect(apply(fresh(), [f('vehicleMake', 'Honda'), f('damageType', 'FIRE')]).captured).not.toContain('claimType'); // mixed: not decided
    // Once a policy has settled it, a stray fact does not change it.
    expect(apply(verified(fresh(), 'POL-100245'), [f('damageType', 'FIRE')]).claimType).toBe('AUTO');
  });

  it('ignores answers that belong to another kind of claim', () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-200318'), f('drivable', 'no'), f('vehicleMake', 'Honda')]);
    expect(d.auto.drivable).toBe(true);
    expect(d.auto.vehicle.make).toBe('');
  });

  it('puts the amount of a health claim on its service lines, not here', () => {
    const d = apply(startDraft('PROVIDER'), [f('estimatedAmount', '1895')], providerCtx);
    expect(d.estimatedAmount).toBe('');
  });
});

describe('applyIntakeFields: hasOtherParty', () => {
  const auto = () => apply(fresh(), [f('policyNumber', 'POL-100245')]);

  it('"yes" adds one placeholder party to fill in later, once', () => {
    const d = apply(auto(), [f('hasOtherParty', 'yes')]);
    expect(d.auto.otherParties).toEqual([{ name: 'Unknown', atFault: 'UNKNOWN' }]);
    expect(apply(d, [f('hasOtherParty', 'yes')]).auto.otherParties).toHaveLength(1);
  });

  it('"no" removes only the placeholder', () => {
    const d = apply(auto(), [f('hasOtherParty', 'yes')]);
    expect(apply(d, [f('hasOtherParty', 'no')]).auto.otherParties).toEqual([]);
  });

  it('"no" never removes a party the person described, and "yes" keeps it', () => {
    const real = { name: 'Dana Ruiz', insurer: 'Acme Mutual', atFault: 'YES' as const };
    const d = { ...auto(), auto: { ...auto().auto, otherParties: [real] } };
    expect(apply(d, [f('hasOtherParty', 'no')]).auto.otherParties).toEqual([real]);
    expect(apply(d, [f('hasOtherParty', 'yes')]).auto.otherParties).toEqual([real]);
  });
});

describe('applyIntakeFields: people change their minds', () => {
  it('later facts overwrite earlier ones, in the same batch and across turns', () => {
    let d = apply(fresh(), [f('policyNumber', 'POL-100245'), f('vehicleDamage', 'Front bumper'), f('vehicleDamage', 'Rear bumper')]);
    expect(d.auto.vehicle.damage).toBe('Rear bumper');
    d = apply(d, [f('description', 'I was rear-ended on the way to work.')]);
    d = apply(d, [f('description', 'Rear-ended at a red light on Lamar Blvd.'), f('drivable', 'yes')]);
    expect(d.incidentDescription).toBe('Rear-ended at a red light on Lamar Blvd.');
    d = apply(d, [f('drivable', 'no')]);
    expect(d.auto.drivable).toBe(false);
  });
});

describe('applyIntakeFields: bad values', () => {
  it('skips a value that does not fit and never throws', () => {
    const base = apply(fresh(), [f('policyNumber', 'POL-100245')]);
    const junk: IntakeField[] = [
      f('estimatedAmount', 'lots'),
      f('state', 'Texas'),
      f('vehicleVin', 'not-a-vin'),
      f('vehicleYear', '1850'),
      f('dateOfLoss', '2026-02-31'),
      f('policyNumber', 'POL-1'),
      f('drivable', 'maybe'),
      f('incidentType', 'EXPLOSION'),
      f('description', '   '),
      { key: 'bogus' as IntakeKey, value: 'x', confidence: 'high' },
      { key: 'city', value: undefined as unknown as string, confidence: 'high' },
    ];
    let out: IntakeDraft | undefined;
    expect(() => (out = apply(base, junk))).not.toThrow();
    expect(out).toMatchObject({ estimatedAmount: '', dateOfLoss: '', policyNumber: 'POL-100245', incidentDescription: '', location: { city: '', state: '' } });
    expect(out!.auto).toMatchObject({ drivable: true, incidentType: 'COLLISION' });
    expect(out!.auto.vehicle.vin).toBeUndefined();
  });

  it('is a no-op for an empty list', () => {
    const d = fresh();
    expect(apply(d, [])).toBe(d);
  });
});

describe('applyIntakeFields: confidence', () => {
  it('flags a low-confidence value "estimated" where the form can show that, and a firm answer clears it', () => {
    let d = apply(fresh(), [f('policyNumber', 'POL-100245'), f('vehicleDamage', 'Rear bumper', 'low'), f('estimatedAmount', '3000', 'low'), f('dateOfLoss', '2026-09-26', 'low')]);
    expect(d.estimatedFields).toEqual(expect.arrayContaining(['vehicleDamage', 'estimatedAmount', 'dateOfLoss']));
    d = apply(d, [f('vehicleDamage', 'Rear bumper and trunk lid', 'high'), f('estimatedAmount', '3840', 'medium')]);
    expect(d.estimatedFields).toEqual(['dateOfLoss']);
  });

  it('does not flag a provider\'s date of service (the form has no "not sure" box for it)', () => {
    const d = apply(startDraft('PROVIDER'), [f('dateOfLoss', '2026-09-15', 'low')], providerCtx);
    expect(d.dateOfLoss).toBe('2026-09-15');
    expect(d.estimatedFields).toEqual([]);
  });
});

describe('applyIntakeFields: health', () => {
  it('a provider\'s claim is always a health claim', () => {
    const d = apply(startDraft('PROVIDER'), [f('damageType', 'FIRE')], providerCtx);
    expect(d.claimType).toBe('HEALTH');
    expect(d.captured).toContain('claimType');
  });

  it('keeps the patient as typed until the plan is known, then matches the plan member', () => {
    let d = apply(fresh(), [f('policyNumber', 'POL-300577'), f('patientName', 'lopez, maria')]);
    expect(d.claimType).toBe('HEALTH');
    expect(d.health).toMatchObject({ patientName: 'lopez, maria', memberId: '' });
    d = verified(d, 'POL-300577');
    expect(d.health).toMatchObject({ patientName: 'Maria Lopez', memberId: 'MBR-778812', patientDob: '1988-04-12' });
  });

  it('matches the member straight away when the plan is already verified', () => {
    const d = apply(verified(fresh(), 'POL-300577'), [f('patientName', 'Lucas Lopez')]);
    expect(d.health).toMatchObject({ memberId: 'MBR-778813', patientDob: '2015-09-30' });
  });

  it('keeps a name that is not on the plan (the form then asks to pick a member)', () => {
    const d = apply(verified(fresh(), 'POL-300577'), [f('patientName', 'Bob Stranger')]);
    expect(d.health).toMatchObject({ patientName: 'Bob Stranger', memberId: '' });
  });
});

describe('intakeKnown', () => {
  it('knows nothing from a fresh draft (the form defaults are not answers)', () => {
    expect(intakeKnown(fresh())).toEqual({});
  });

  it('a provider already knows it is a health claim', () => {
    expect(intakeKnown(startDraft('PROVIDER'))).toEqual({ claimType: 'HEALTH' });
  });

  it('reports captured answers, including yes/no, enums and the kind of claim', () => {
    const d = apply(fresh(), [
      f('policyNumber', 'POL-100245'),
      f('dateOfLoss', '2026-09-26'),
      f('description', 'Rear-ended at a red light.'),
      f('city', 'Austin'),
      f('state', 'TX'),
      f('incidentType', 'COLLISION'),
      f('vehicleDamage', 'Rear bumper'),
      f('drivable', 'no'),
      f('injuries', 'no'),
      f('hasOtherParty', 'yes'),
      f('estimatedAmount', '3,840.17'),
    ]);
    expect(intakeKnown(d)).toEqual({
      policyNumber: 'POL-100245',
      claimType: 'AUTO',
      dateOfLoss: '2026-09-26',
      description: 'Rear-ended at a red light.',
      city: 'Austin',
      state: 'TX',
      estimatedAmount: '3840.17',
      vehicleDamage: 'Rear bumper',
      incidentType: 'COLLISION',
      drivable: 'no',
      injuries: 'no',
      hasOtherParty: 'yes',
    });
  });

  it('does not call the policy address "where it happened", but does know the car from the policy', () => {
    const d = verified(apply(fresh(), [f('policyNumber', 'POL-100245')]), 'POL-100245');
    expect(d.location.city).toBe('Austin'); // pre-filled by the policy lookup, as in the form
    const known = intakeKnown(d);
    expect(known).not.toHaveProperty('city');
    expect(known).toMatchObject({ claimType: 'AUTO', vehicleYear: '2022', vehicleMake: 'Toyota', vehicleModel: 'RAV4' });
  });

  it('maps a home claim and a health claim', () => {
    const home = apply(fresh(), [f('policyNumber', 'POL-200318'), f('damageType', 'WATER'), f('habitable', 'yes'), f('areasAffected', 'Kitchen')]);
    expect(intakeKnown(home)).toMatchObject({ claimType: 'PROPERTY', damageType: 'WATER', habitable: 'yes', areasAffected: 'Kitchen' });

    const health = { ...apply(startDraft('PROVIDER'), [f('patientName', 'Maria Lopez')], providerCtx), health: { ...emptyDraft('PROVIDER').health, patientName: 'Maria Lopez', lines: [{ procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245 }] } };
    expect(intakeKnown(health)).toMatchObject({ claimType: 'HEALTH', patientName: 'Maria Lopez', estimatedAmount: '245' });
  });

  it('what was applied comes straight back', () => {
    const fields = [f('policyNumber', 'POL-200318'), f('dateOfLoss', '2026-09-20'), f('damageType', 'WIND'), f('habitable', 'no')];
    const known = intakeKnown(apply(fresh(), fields));
    for (const x of fields) expect(known[x.key]).toBe(x.value);
  });
});

// ---------- scans ----------

const fld = (key: ExtractedField['key'], value: string, confidence: Confidence = 'high'): ExtractedField => ({ key, value, confidence, evidence: 'doc' });
const line = (over: Partial<ExtractedLine> = {}): ExtractedLine => ({ description: 'Office visit', procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245, confidence: 'high', ...over });
const scan = (over: Partial<ScanResult> = {}): ScanResult => ({ source: 'ai', documents: [], fields: [], serviceLines: [], warnings: [], ...over });
const doc = (fileName: string, category: 'INVOICE' | 'PHOTO' = 'PHOTO') => ({ key: fileName, category, fileName, sizeBytes: 1, mimeType: 'application/pdf' });

describe('applyScanToDraft: a dropped bill', () => {
  const bill = scan({
    claimTypeGuess: 'HEALTH',
    documents: [{ fileName: 'bill.pdf', documentType: 'INVOICE', summary: 'Itemized statement' }],
    fields: [fld('patientName', 'Maria Lopez'), fld('dateOfLoss', '2026-09-15'), fld('city', 'Austin'), fld('state', 'TX'), fld('description', 'Knee pain, MRI ordered.', 'medium')],
    serviceLines: [line(), line({ procedureCode: '73721', diagnosisCode: 'S83.241A', description: 'MRI knee', billedAmount: 1650 })],
  });
  const dropped = (): IntakeDraft => ({ ...fresh(), documents: [doc('bill.pdf')] });

  it('fills in the claim, picks the one health plan, and takes the date from the bill', () => {
    const out = applyScanToDraft(dropped(), bill, ctx);
    expect(out.draft).toMatchObject({ claimType: 'HEALTH', policyNumber: 'POL-300577', dateOfLoss: '2026-09-15', incidentDescription: 'Knee pain, MRI ordered.', location: { city: 'Austin', state: 'TX' } });
    expect(out.draft.health.lines.map((l) => l.billedAmount)).toEqual([245, 1650]);
    expect(out.draft.documents[0].category).toBe('INVOICE'); // the file was relabelled
    expect(out.draft.captured).toEqual(expect.arrayContaining(['claimType', 'dateOfLoss', 'description', 'city', 'state']));
    // The date, the description, city, state and two lines. The patient waits for the plan.
    expect(out.applied).toBe(6);
    expect(out.labels).toEqual(expect.arrayContaining(['Date of service', 'Clinical summary', 'Service lines (2)']));
  });

  it('matches the patient to a plan member once the policy is verified (catch-up)', () => {
    const out = applyScanToDraft(dropped(), bill, ctx);
    expect(out.draft.health.memberId).toBe('');
    const after = applyVerifiedPolicy(out.draft, policy('POL-300577'), customer);
    expect(after.draft.health).toMatchObject({ patientName: 'Maria Lopez', memberId: 'MBR-778812' });
    expect(after.applied).toBe(1);
    expect(after.draft.scan?.appliedLabels).toContain('Patient');
  });

  it('stores the scan so the form knows what was read, and keeps earlier documents when a second scan arrives', () => {
    const first = applyScanToDraft(dropped(), bill, ctx).draft;
    expect(first.scan).toMatchObject({ applied: true });
    const second = applyScanToDraft({ ...first, documents: [...first.documents, doc('x-ray.pdf')] }, scan({ documents: [{ fileName: 'x-ray.pdf', documentType: 'MEDICAL_RECORD', summary: '' }] }), ctx).draft;
    expect(second.scan?.documents.map((d) => d.fileName)).toEqual(['bill.pdf', 'x-ray.pdf']);
    expect(second.scan?.appliedLabels).toContain('Service lines (2)');
  });

  it('catching up again changes nothing', () => {
    const out = applyVerifiedPolicy(applyScanToDraft(dropped(), bill, ctx).draft, policy('POL-300577'), customer);
    const again = catchUpScan(out.draft);
    expect(again.applied).toBe(0);
    expect(again.draft.health.lines).toHaveLength(2);
  });
});

describe('applyScanToDraft: the rules', () => {
  const estimate = (fields: ExtractedField[], over: Partial<ScanResult> = {}) => scan({ claimTypeGuess: 'AUTO', fields, ...over });

  it('never overwrites what the person said, and never takes a date when one is there', () => {
    const d: IntakeDraft = { ...apply(fresh(), [f('policyNumber', 'POL-100245'), f('dateOfLoss', '2026-09-26'), f('description', 'In my own words, rear-ended.')]) };
    const out = applyScanToDraft(d, estimate([fld('description', 'A different text.'), fld('dateOfLoss', '2026-09-01'), fld('vehicleDamage', 'Rear bumper')]), ctx);
    expect(out.draft.incidentDescription).toBe('In my own words, rear-ended.');
    expect(out.draft.dateOfLoss).toBe('2026-09-26');
    expect(out.draft.auto.vehicle.damage).toBe('Rear bumper');
  });

  it('applies a low-confidence value only where the form can flag it "not sure"', () => {
    const out = applyScanToDraft(fresh(), estimate([fld('vehicleDamage', 'Rear bumper', 'low'), fld('estimatedAmount', '3840.17', 'low'), fld('city', 'Austin', 'low'), fld('vehicleVin', '2T3P1RFV8NW123456', 'low')]), ctx);
    expect(out.draft.auto.vehicle.damage).toBe('Rear bumper');
    expect(out.draft.estimatedAmount).toBe('3840.17');
    expect(out.draft.estimatedFields).toEqual(expect.arrayContaining(['vehicleDamage', 'estimatedAmount']));
    expect(out.draft.location.city).toBe(''); // no "not sure" box for a city: left for the person to say
    expect(out.draft.auto.vehicle.vin).toBeUndefined();
  });

  it('does not apply a low-confidence date for a provider, but flags it for a person', () => {
    const date = [fld('dateOfLoss', '2026-09-15', 'low')];
    const provider = applyScanToDraft(startDraft('PROVIDER'), scan({ fields: date }), providerCtx);
    expect(provider.draft.dateOfLoss).toBe('');
    const person = applyScanToDraft(fresh(), estimate(date), ctx);
    expect(person.draft.dateOfLoss).toBe('2026-09-15');
    expect(person.draft.estimatedFields).toContain('dateOfLoss');
  });

  it('refuses a document date in the future', () => {
    expect(applyScanToDraft(fresh(), estimate([fld('dateOfLoss', '2027-01-01')]), ctx).draft.dateOfLoss).toBe('');
  });

  it('settles the kind of claim from the documents, and only picks a policy when exactly one fits', () => {
    const two = [...ctx.policies, { policyNumber: 'POL-100246', type: 'AUTO' as const, label: 'Auto, Honda Civic' }];
    const out = applyScanToDraft(fresh(), estimate([fld('vehicleDamage', 'Rear bumper')]), { ...ctx, policies: two });
    expect(out.draft.claimType).toBe('AUTO');
    expect(out.draft.captured).toContain('claimType');
    expect(out.draft.policyNumber).toBe('');

    const one = applyScanToDraft(fresh(), estimate([fld('vehicleDamage', 'Rear bumper')]), ctx);
    expect(one.draft.policyNumber).toBe('POL-100245');
    const home = applyScanToDraft(fresh(), scan({ claimTypeGuess: 'PROPERTY', fields: [fld('areasAffected', 'Kitchen')] }), ctx);
    expect(home.draft).toMatchObject({ claimType: 'PROPERTY', policyNumber: 'POL-200318' });
  });

  it('does not second-guess a kind of claim the conversation already settled', () => {
    const d = apply(fresh(), [f('damageType', 'WATER')]);
    const out = applyScanToDraft(d, estimate([fld('vehicleDamage', 'Rear bumper')]), ctx);
    expect(out.draft.claimType).toBe('PROPERTY');
    expect(out.draft.policyNumber).toBe('');
  });

  it("a provider's bill never picks a policy: Ease asks for the plan number", () => {
    const out = applyScanToDraft(startDraft('PROVIDER'), scan({ claimTypeGuess: 'HEALTH', fields: [fld('patientName', 'Maria Lopez')], serviceLines: [line()] }), providerCtx);
    expect(out.draft.policyNumber).toBe('');
    expect(out.draft.health.lines[0].billedAmount).toBe(245);
  });

  it('counts nothing when there is nothing to use', () => {
    const out = applyScanToDraft(fresh(), scan(), ctx);
    expect(out.applied).toBe(0);
    expect(out.labels).toEqual([]);
  });
});

// ---------- the policy lookup ----------

const lookupFor =
  (customerOf: Customer = customer): PolicyLookup =>
  async (policyNumber, date) => {
    const p = seed.policies.find((x) => x.policyNumber === policyNumber);
    if (!p) throw new Error(`We couldn't find policy ${policyNumber}. Check your ID card or declarations page.`);
    if (p.status !== 'ACTIVE') throw new Error(`Policy ${policyNumber} is ${p.status.toLowerCase()}. Contact your agent to discuss options.`);
    if (date && (date < p.effectiveDate || date > p.expiryDate)) throw new Error(`${date} is outside the coverage period ${p.effectiveDate} – ${p.expiryDate}.`);
    return { policy: structuredClone(p), customer: customerOf };
  };

describe('checkPolicy', () => {
  const ready = (number: string, date: string) => apply(fresh(), [f('policyNumber', number), f('dateOfLoss', date)]);

  it('waits until it has both a policy number and a date', async () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-100245')]);
    expect(await checkPolicy(d, 'CLAIMANT', lookupFor())).toEqual({ status: 'skipped', draft: d });
    const done = verified(ready('POL-100245', '2026-09-26'), 'POL-100245');
    expect((await checkPolicy(done, 'CLAIMANT', lookupFor())).status).toBe('skipped'); // already verified
  });

  it('verifies the policy and fills in what it knows', async () => {
    const check = await checkPolicy(ready('POL-100245', '2026-09-26'), 'CLAIMANT', lookupFor());
    expect(check.status).toBe('verified');
    expect(check.draft.policy?.policyNumber).toBe('POL-100245');
    expect(check.draft.auto.vehicle).toMatchObject({ make: 'Toyota', model: 'RAV4' });
  });

  it('says which policy could not be confirmed, clears it, and asks for it again', async () => {
    const check = await checkPolicy(ready('POL-100245', '2026-09-26'), 'CLAIMANT', async () => {
      throw new Error('Policy POL-100245 is lapsed. Contact your agent to discuss options.');
    });
    expect(check).toMatchObject({ status: 'failed', cause: 'policy' });
    if (check.status !== 'failed') return;
    expect(check.text).toBe("I couldn't confirm POL-100245: Policy POL-100245 is lapsed. Contact your agent to discuss options. Which policy should I use?");
    expect(check.draft).toMatchObject({ policyNumber: '', dateOfLoss: '2026-09-26' });
    expect(check.draft.policy).toBeUndefined();
  });

  it('when only the date is the problem, clears the date and asks for another', async () => {
    const check = await checkPolicy(ready('POL-100245', '2026-02-01'), 'CLAIMANT', lookupFor());
    expect(check).toMatchObject({ status: 'failed', cause: 'date' });
    if (check.status !== 'failed') return;
    expect(check.text).toMatch(/^I couldn't confirm POL-100245 for Feb 1, 2026: .*outside the coverage period.*Which date should I use\?$/);
    expect(check.draft).toMatchObject({ policyNumber: 'POL-100245', dateOfLoss: '' });
  });

  it('forgets a "not sure" flag on the date it just threw away', async () => {
    const d = apply(fresh(), [f('policyNumber', 'POL-100245'), f('dateOfLoss', '2026-02-01', 'low')]);
    const check = await checkPolicy(d, 'CLAIMANT', lookupFor());
    expect(check.draft.estimatedFields).toEqual([]);
  });

  it('a provider can only use a health plan', async () => {
    const d = apply(startDraft('PROVIDER'), [f('policyNumber', 'POL-100245'), f('dateOfLoss', '2026-09-26')], providerCtx);
    const check = await checkPolicy(d, 'PROVIDER', lookupFor());
    expect(check).toMatchObject({ status: 'failed', cause: 'policy' });
    if (check.status !== 'failed') return;
    expect(check.text).toMatch(/health plans/);
    expect(check.draft.policyNumber).toBe('');

    const good = apply(startDraft('PROVIDER'), [f('policyNumber', 'POL-300577'), f('dateOfLoss', '2026-09-15')], providerCtx);
    expect((await checkPolicy(good, 'PROVIDER', lookupFor())).status).toBe('verified');
  });
});

// ---------- hand-off ----------

describe('hand-off to the form', () => {
  const built = () => verified(apply(fresh(), [f('policyNumber', 'POL-100245'), f('dateOfLoss', '2026-09-26'), f('description', 'Rear-ended at a red light.'), f('vehicleDamage', 'Rear bumper'), f('drivable', 'no'), f('city', 'Austin')]), 'POL-100245');

  it('lists what was filled in, with friendly names, for the Details step banner', () => {
    expect(capturedLabels(built())).toEqual(expect.arrayContaining(['Policy', 'Date it happened', 'Description', 'Vehicle damage', 'Drivable', 'City']));
    expect(capturedLabels(built())).not.toContain('Estimated amount');
    expect(new Set(capturedLabels(built())).size).toBe(capturedLabels(built()).length);
  });

  it('sets the scan the Details step reads, even when no document was dropped', () => {
    const out = finalizeDraft(built(), 'demo');
    expect(out.scan).toMatchObject({ applied: true, source: 'demo', documents: [], fields: [], serviceLines: [], warnings: [] });
    expect(out.scan?.appliedLabels?.length).toBeGreaterThan(3);
    expect(out.scan?.id).toBeTruthy();
  });

  it('keeps an existing scan and adds to its labels', () => {
    const d = applyScanToDraft({ ...fresh(), documents: [doc('bill.pdf')] }, scan({ claimTypeGuess: 'HEALTH', documents: [{ fileName: 'bill.pdf', documentType: 'INVOICE', summary: 's' }], serviceLines: [line()] }), ctx).draft;
    const out = finalizeDraft(d, 'ai');
    expect(out.scan?.documents).toHaveLength(1);
    expect(out.scan?.appliedLabels).toEqual(expect.arrayContaining(['Policy', 'Service line']));
  });

  it('opens the form on Details once the policy is verified, otherwise on the Policy step', () => {
    expect(stepForDraft(built())).toBe(2);
    expect(stepForDraft(fresh())).toBe(0);
    expect(stepForDraft(apply(fresh(), [f('policyNumber', 'POL-100245')]))).toBe(0);
  });

  it('can still be handled by the form: a draft built from emptyDraft plus the policy', () => {
    const viaForm = applyPolicy(emptyDraft('CLAIMANT'), policy('POL-100245'), customer);
    expect(viaForm.captured).toBeUndefined(); // the step-by-step form never sets it, and does not need it
  });
});
