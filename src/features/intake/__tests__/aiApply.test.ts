import { describe, expect, it } from 'vitest';
import type { ExtractedField, ExtractedLine, ScanResult } from '../../../domain/aiTypes';
import { buildSeed } from '../../../services/seed';
import { applyChanges, defaultSelection, labelDocuments, proposeChanges, reviewNotes } from '../aiApply';
import { applyPolicy, emptyDraft, type IntakeDraft } from '../draft';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const policy = (n: string) => seed.policies.find((p) => p.policyNumber === n)!;
const customer = seed.customers[0];

const f = (key: ExtractedField['key'], value: string, confidence: ExtractedField['confidence'] = 'high'): ExtractedField => ({ key, value, confidence, evidence: 'doc' });
const line = (over: Partial<ExtractedLine> = {}): ExtractedLine => ({ description: 'Office visit', procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245, confidence: 'high', ...over });
const scan = (over: Partial<ScanResult> = {}): ScanResult => ({ source: 'ai', documents: [], fields: [], serviceLines: [], warnings: [], ...over });

const healthDraft = (): IntakeDraft => ({ ...applyPolicy(emptyDraft('PROVIDER'), policy('POL-300577'), customer), dateOfLoss: '2026-09-15' });
const autoDraft = (): IntakeDraft => ({ ...applyPolicy(emptyDraft('CLAIMANT'), policy('POL-100245'), customer), dateOfLoss: '2026-09-26' });

const apply = (d: IntakeDraft, s: ScanResult, ids?: string[]) => {
  const selected = ids ? new Set(ids) : defaultSelection(proposeChanges(d, s));
  return applyChanges(d, s, selected);
};

describe('health bill', () => {
  const s = scan({
    fields: [f('patientName', 'Maria Lopez'), f('providerNpi', '1234567893'), f('city', 'Austin'), f('state', 'tx'), f('description', 'Knee pain, MRI ordered.', 'medium')],
    serviceLines: [line(), line({ procedureCode: '73721', diagnosisCode: 'S83.241A', description: 'MRI knee', billedAmount: 1650 })],
  });

  it('selects the plan member (id, name and DOB come from the plan, not from the scan)', () => {
    const { draft, applied } = apply(healthDraft(), s);
    expect(draft.health.memberId).toBe('MBR-778812');
    expect(draft.health.patientName).toBe('Maria Lopez');
    expect(draft.health.patientDob).toBe('1988-04-12');
    expect(draft.location).toEqual({ city: 'Austin', state: 'TX' });
    expect(draft.incidentDescription).toBe('Knee pain, MRI ordered.');
    // Patient, description and 2 service lines. City, state and NPI were skipped: the form already had them.
    expect(applied).toBe(4);
  });

  it('fills the empty first line, then appends', () => {
    const { draft } = apply(healthDraft(), s);
    expect(draft.health.lines).toEqual([
      { procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 245 },
      { procedureCode: '73721', diagnosisCode: 'S83.241A', units: 1, billedAmount: 1650 },
    ]);
  });

  it('does not add a line that is already on the form', () => {
    const once = apply(healthDraft(), s).draft;
    expect(proposeChanges(once, s).filter((p) => p.id.startsWith('line:'))).toEqual([]);
  });

  it('leaves a code blank (with a note) when it is not in the catalog, instead of guessing', () => {
    const odd = scan({ serviceLines: [line({ procedureCode: '99999', diagnosisCode: 'Z99.99' })] });
    const [p] = proposeChanges(healthDraft(), odd);
    expect(p.note).toMatch(/99999/);
    expect(p.note).toMatch(/Z99\.99/);
    const { draft } = apply(healthDraft(), odd);
    expect(draft.health.lines[0]).toMatchObject({ procedureCode: '', diagnosisCode: '', billedAmount: 245 });
  });

  it('blocks a patient who is not a member of the plan', () => {
    const [p] = proposeChanges(healthDraft(), scan({ fields: [f('patientName', 'Bob Stranger')] }));
    expect(p.blocked).toMatch(/not a member/);
    expect(p.defaultOn).toBe(false);
    const { draft, applied } = apply(healthDraft(), scan({ fields: [f('patientName', 'Bob Stranger')] }), ['patientName']);
    expect(applied).toBe(0);
    expect(draft.health.memberId).toBe('');
  });

  it('matches "Lopez, Maria" to "Maria Lopez"', () => {
    const { draft } = apply(healthDraft(), scan({ fields: [f('patientName', 'LOPEZ, MARIA')] }));
    expect(draft.health.memberId).toBe('MBR-778812');
  });

  it('rejects malformed values: NPI, state code', () => {
    const ps = proposeChanges(healthDraft(), scan({ fields: [f('providerNpi', '12345'), f('state', 'Texas')] }));
    expect(ps.map((p) => [p.id, !!p.blocked])).toEqual([['providerNpi', true], ['state', true]]);
  });

  it('ignores keys that do not apply to health', () => {
    expect(proposeChanges(healthDraft(), scan({ fields: [f('vehicleVin', '2T3P1RFV8NW123456'), f('estimatedAmount', '99')] }))).toEqual([]);
  });
});

describe('never overwrites what the user typed', () => {
  it('shows a conflict, unticked, with the current value', () => {
    const d = { ...healthDraft(), incidentDescription: 'My own words about the visit.' };
    const [p] = proposeChanges(d, scan({ fields: [f('description', 'Something else entirely.')] }));
    expect(p.current).toBe('My own words about the visit.');
    expect(p.defaultOn).toBe(false);
    expect(apply(d, scan({ fields: [f('description', 'Something else entirely.')] })).draft.incidentDescription).toBe('My own words about the visit.');
  });

  it('only replaces it when the user explicitly ticks it', () => {
    const d = { ...healthDraft(), incidentDescription: 'My own words about the visit.' };
    const s = scan({ fields: [f('description', 'Something else entirely.')] });
    expect(apply(d, s, ['description']).draft.incidentDescription).toBe('Something else entirely.');
  });

  it('skips values the form already has (case and spacing ignored)', () => {
    const d = { ...autoDraft() }; // make/model/VIN pre-filled from the policy
    expect(proposeChanges(d, scan({ fields: [f('vehicleMake', ' toyota '), f('vehicleVin', '2T3P1RFV8NW123456')] }))).toEqual([]);
  });
});

describe('confidence', () => {
  it('low confidence is unticked, and when applied it marks the field "estimated"', () => {
    const s = scan({ fields: [f('vehicleDamage', 'Rear bumper', 'low'), f('estimatedAmount', '3840.17', 'low'), f('vehicleVin', '2T3P1RFV8NW999999', 'low')] });
    const d = autoDraft();
    const ps = proposeChanges(d, s);
    expect(ps.find((p) => p.id === 'vehicleDamage')?.defaultOn).toBe(false);
    const { draft } = apply(d, s, ['vehicleDamage', 'estimatedAmount']);
    expect(draft.auto.vehicle.damage).toBe('Rear bumper');
    expect(draft.estimatedAmount).toBe('3840.17');
    expect(draft.estimatedFields).toEqual(expect.arrayContaining(['vehicleDamage', 'estimatedAmount']));
  });

  it('high confidence is not marked estimated', () => {
    const { draft } = apply(autoDraft(), scan({ fields: [f('vehicleDamage', 'Rear bumper')] }));
    expect(draft.estimatedFields).toEqual([]);
  });
});

describe('auto estimate', () => {
  it('fills amount, damage and VIN rules', () => {
    const d = { ...autoDraft(), auto: { ...autoDraft().auto, vehicle: { make: '', model: '', damage: '' } } };
    const { draft } = apply(d, scan({ fields: [f('vehicleMake', 'Toyota'), f('vehicleVin', '2t3p1rfv8nw123456'), f('estimatedAmount', '$3,840.17')] }));
    expect(draft.auto.vehicle).toMatchObject({ make: 'Toyota', vin: '2T3P1RFV8NW123456' });
    expect(draft.estimatedAmount).toBe('3840.17');
  });

  it('rejects a VIN with the wrong shape', () => {
    const d = { ...autoDraft(), auto: { ...autoDraft().auto, vehicle: { make: 'Toyota', model: 'RAV4', damage: '' } } };
    expect(proposeChanges(d, scan({ fields: [f('vehicleVin', 'TOO-SHORT')] }))[0].blocked).toBeTruthy();
  });
});

describe('labelDocuments', () => {
  it('relabels files to the type the AI recognised, except OTHER', () => {
    const d: IntakeDraft = {
      ...healthDraft(),
      documents: [
        { key: '1', category: 'PHOTO', fileName: 'scan0001.pdf', sizeBytes: 1, mimeType: 'application/pdf' },
        { key: '2', category: 'INVOICE', fileName: 'misc.pdf', sizeBytes: 1, mimeType: 'application/pdf' },
      ],
    };
    const s = scan({
      documents: [
        { fileName: 'scan0001.pdf', documentType: 'INVOICE', summary: '' },
        { fileName: 'misc.pdf', documentType: 'OTHER', summary: '' },
      ],
    });
    const { draft, relabeled } = labelDocuments(d, s);
    expect(draft.documents.map((x) => x.category)).toEqual(['INVOICE', 'INVOICE']);
    expect(relabeled).toEqual([{ fileName: 'scan0001.pdf', to: 'INVOICE' }]);
  });
});

describe('reviewNotes (plain-rule cross-checks)', () => {
  it('flags a document date that differs from the date entered for the policy check', () => {
    const notes = reviewNotes(healthDraft(), scan({ fields: [f('dateOfLoss', '2026-09-10')] }));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/date of service/);
  });

  it('is quiet when dates agree', () => {
    expect(reviewNotes(healthDraft(), scan({ fields: [f('dateOfLoss', '2026-09-15')] }))).toEqual([]);
  });

  it('flags a bill total that differs from the sum of its lines', () => {
    const notes = reviewNotes(healthDraft(), scan({ fields: [f('estimatedAmount', '2000')], serviceLines: [line(), line({ billedAmount: 1650 })] }));
    expect(notes.join(' ')).toMatch(/\$1,895\.00/);
    expect(notes.join(' ')).toMatch(/\$2,000\.00/);
  });

  it('does not apply the date: the policy check depends on it', () => {
    const d = healthDraft();
    expect(proposeChanges(d, scan({ fields: [f('dateOfLoss', '2026-09-10')] }))).toEqual([]);
  });
});

describe('applyChanges reports what it wrote', () => {
  it('lists the field keys (and line ids) that were applied, not the ones it skipped', () => {
    const s = scan({ fields: [f('patientName', 'Bob Stranger'), f('city', 'Austin'), f('description', 'Knee pain.')], serviceLines: [line()] });
    const { keys, applied } = applyChanges(healthDraft(), s, new Set(['patientName', 'description', 'line:0']));
    expect(keys).toEqual(['description', 'line:0']); // Bob is not a member; city was not selected
    expect(applied).toBe(keys.length);
  });
});
