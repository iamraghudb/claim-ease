// What the "Your claim so far" card shows, worked out from the draft. Pure, so it is tested.

import { AUTO_INCIDENT_TYPES, PROPERTY_DAMAGE_TYPES } from '../../../domain/catalog';
import { formatUSD } from '../../../domain/rulesEngine';
import { formatDate } from '../../../components/format';
import { draftAmount, type IntakeDraft } from '../draft';

export interface SummaryRow {
  /** Stable per fact. */
  key: string;
  label: string;
  value: string;
  /** The person (or Ease) was not sure of this one. */
  unsure?: boolean;
}

const has = (d: IntakeDraft, key: string) => !!d.captured?.includes(key);
const yes = (v: boolean) => (v ? 'Yes' : 'No');

/** The facts captured so far, in the order they are read. The policy has its own place on the card. */
export function summaryRows(d: IntakeDraft): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const health = d.claimType === 'HEALTH';
  const unsure = (k: string) => d.estimatedFields.includes(k);
  const add = (key: string, label: string, value: string | undefined | null, isUnsure?: boolean) => {
    const v = (value ?? '').trim();
    if (v) rows.push({ key, label, value: v, ...(isUnsure ? { unsure: true } : {}) });
  };

  add('dateOfLoss', health ? 'Date of service' : 'When', d.dateOfLoss ? formatDate(d.dateOfLoss) : '', unsure('dateOfLoss'));
  if (has(d, 'city') || has(d, 'state')) add('where', 'Where', [d.location.city, d.location.state].filter(Boolean).join(', '));
  add('description', health ? 'Visit' : 'What happened', d.incidentDescription);

  if (d.claimType === 'AUTO') {
    const a = d.auto;
    add('vehicle', 'Vehicle', [a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' '));
    add('vehicleDamage', 'Damage', a.vehicle.damage, unsure('vehicleDamage'));
    if (has(d, 'incidentType')) add('incidentType', 'Kind of incident', AUTO_INCIDENT_TYPES.find((t) => t.value === a.incidentType)?.label);
    if (has(d, 'drivable')) add('drivable', 'Car drivable', yes(a.drivable));
    if (has(d, 'injuries')) add('injuries', 'Anyone hurt', yes(a.injuries));
    if (has(d, 'hasOtherParty')) add('hasOtherParty', 'Other party', yes(a.otherParties.length > 0));
    add('policeReportNumber', 'Police report #', a.policeReportNumber);
  } else if (d.claimType === 'PROPERTY') {
    const p = d.property;
    if (has(d, 'damageType')) add('damageType', 'Kind of damage', PROPERTY_DAMAGE_TYPES.find((t) => t.value === p.damageType)?.label);
    if (has(d, 'habitable')) add('habitable', 'Home livable', yes(p.habitable));
    add('propertyAddress', 'Address', p.propertyAddress);
    add('areasAffected', 'Areas affected', p.areasAffected, unsure('areasAffected'));
    add('itemsStolenOrDamaged', 'Items', p.itemsStolenOrDamaged, unsure('itemsStolenOrDamaged'));
  } else {
    const h = d.health;
    add('patientName', 'Patient', h.patientName);
    if (has(d, 'providerName')) add('providerName', 'Provider', h.provider.name);
    const billed = h.lines.filter((l) => l.billedAmount > 0);
    if (billed.length) add('services', 'Services', `${billed.length} ${billed.length === 1 ? 'service' : 'services'}, ${formatUSD(draftAmount(d))} billed`);
  }

  if (!health && Number(d.estimatedAmount) > 0) add('estimatedAmount', 'Amount', formatUSD(Number(d.estimatedAmount)), unsure('estimatedAmount'));
  if (d.documents.length) add('documents', 'Documents', `${d.documents.length} ${d.documents.length === 1 ? 'file' : 'files'}`);
  return rows;
}

export interface Essential {
  key: string;
  label: string;
  done: boolean;
}

/**
 * The handful of details Ease needs before a claim can go to review, for the "3 of 7 details" count. Mirrors what
 * the server treats as essential, so the count and Ease's own questions agree.
 */
export function essentials(d: IntakeDraft): Essential[] {
  const items: Essential[] = [
    { key: 'policy', label: 'Policy', done: !!d.policyNumber },
    { key: 'date', label: d.claimType === 'HEALTH' && has(d, 'claimType') ? 'Date of service' : 'Date', done: !!d.dateOfLoss },
    { key: 'what', label: 'What happened', done: d.incidentDescription.trim() !== '' },
  ];
  const kindKnown = !!d.policy || has(d, 'claimType');
  if (!kindKnown) return items;
  if (d.claimType === 'AUTO') {
    items.push(
      { key: 'damage', label: 'Damage', done: d.auto.vehicle.damage.trim() !== '' },
      { key: 'drivable', label: 'Drivable', done: has(d, 'drivable') },
      { key: 'injuries', label: 'Anyone hurt', done: has(d, 'injuries') },
      { key: 'amount', label: 'Amount', done: Number(d.estimatedAmount) > 0 },
    );
  } else if (d.claimType === 'PROPERTY') {
    items.push(
      { key: 'damageType', label: 'Kind of damage', done: has(d, 'damageType') },
      { key: 'habitable', label: 'Livable', done: has(d, 'habitable') },
      { key: 'amount', label: 'Amount', done: Number(d.estimatedAmount) > 0 },
    );
  } else {
    items.push({ key: 'bill', label: 'Bill or patient', done: d.documents.length > 0 || d.health.patientName.trim() !== '' || d.health.lines.some((l) => l.billedAmount > 0) });
  }
  return items;
}

/**
 * The "Still needed" chips: the server's plain labels, plus the policy or the date when our own policy check could
 * not confirm them and cleared them (the server does not know about that).
 */
export function stillNeededLabels(serverLabels: string[], draft: IntakeDraft, ready: boolean): string[] {
  if (ready) return [];
  const out = [...serverLabels];
  if (!draft.policyNumber && !out.some((l) => /polic/i.test(l))) out.unshift('Which policy');
  if (!draft.dateOfLoss && !out.some((l) => /date/i.test(l))) out.splice(draft.policyNumber ? 0 : 1, 0, 'Date it happened');
  return out;
}
