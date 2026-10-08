import { findProcedure } from './catalog';
import type { Claim, ClaimDetails, ClaimType, DocumentCategory } from './types';

/** The subset of a claim needed to evaluate completeness — works for drafts too. */
export type ClaimLike = Pick<
  Claim,
  | 'claimType'
  | 'dateOfLoss'
  | 'location'
  | 'incidentDescription'
  | 'estimatedAmount'
  | 'estimatedFields'
  | 'documents'
  | 'details'
>;

export interface Requirement {
  key: string;
  label: string;
  kind: 'field' | 'document';
  required: boolean; // false = recommended
  category?: DocumentCategory;
  satisfied: boolean;
  /** True when satisfied with a value marked "estimated / unsure". */
  estimated?: boolean;
}

export function requiredDocumentCategories(_claimType: ClaimType, details: ClaimDetails): {
  category: DocumentCategory;
  label: string;
  required: boolean;
}[] {
  if (details.kind === 'AUTO') {
    const docs: { category: DocumentCategory; label: string; required: boolean }[] = [
      { category: 'PHOTO', label: 'Photos of vehicle damage', required: details.incidentType !== 'THEFT' },
      { category: 'REPAIR_ESTIMATE', label: 'Repair shop estimate', required: details.incidentType !== 'THEFT' },
    ];
    const needsPolice =
      details.otherParties.length > 0 ||
      details.incidentType === 'THEFT' ||
      details.incidentType === 'HIT_AND_RUN' ||
      details.injuries;
    docs.push({ category: 'POLICE_REPORT', label: 'Police report', required: needsPolice });
    return docs;
  }
  if (details.kind === 'PROPERTY') {
    const theft = details.damageType === 'THEFT' || details.damageType === 'VANDALISM';
    return [
      { category: 'PHOTO', label: 'Photos of the damage', required: true },
      { category: 'VIDEO', label: 'Walk-through video', required: false },
      { category: 'REPAIR_ESTIMATE', label: 'Contractor estimate', required: !theft },
      { category: 'RECEIPT', label: 'Receipts / proof of ownership', required: theft },
      { category: 'POLICE_REPORT', label: 'Police report', required: theft },
    ];
  }
  // HEALTH
  const needsRecords =
    details.serviceType === 'PRE_SERVICE' ||
    details.lines.some((l) => findProcedure(l.procedureCode)?.requiresMedicalRecord);
  return [
    { category: 'INVOICE', label: 'Itemized bill', required: true },
    { category: 'MEDICAL_RECORD', label: 'Medical records / clinical notes', required: needsRecords },
  ];
}

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return !Number.isNaN(v) && v > 0;
  return true;
}

/** Full list of fields and documents that make a claim "complete" for its type. */
export function getRequirements(claim: ClaimLike): Requirement[] {
  const est = new Set(claim.estimatedFields);
  const field = (key: string, label: string, value: unknown, required = true): Requirement => ({
    key,
    label,
    kind: 'field',
    required,
    satisfied: hasValue(value),
    estimated: est.has(key) && hasValue(value),
  });

  const reqs: Requirement[] = [
    field('dateOfLoss', claim.claimType === 'HEALTH' ? 'Date of service' : 'Date it happened', claim.dateOfLoss),
    field('location', 'Location (city & state)', claim.location.city && claim.location.state ? 'ok' : ''),
    field(
      'incidentDescription',
      claim.claimType === 'HEALTH' ? 'Clinical summary' : 'Description of what happened (20+ characters)',
      claim.incidentDescription.trim().length >= 20 ? claim.incidentDescription : '',
    ),
    field('estimatedAmount', claim.claimType === 'HEALTH' ? 'Billed amount' : 'Estimated amount', claim.estimatedAmount),
  ];

  const d = claim.details;
  if (d.kind === 'AUTO') {
    reqs.push(field('vehicle', 'Vehicle details', d.vehicle.make && d.vehicle.model ? 'ok' : ''));
    reqs.push(field('vehicleDamage', 'Description of vehicle damage', d.vehicle.damage));
    if (d.otherParties.length > 0) {
      reqs.push(
        field(
          'otherParties',
          'Other party name & insurer',
          d.otherParties.every((p) => p.name && p.insurer) ? 'ok' : '',
        ),
      );
      reqs.push(
        field(
          'liability',
          'Who was at fault',
          d.otherParties.every((p) => p.atFault !== 'UNKNOWN') ? 'ok' : '',
          false,
        ),
      );
    }
    const needsPolice = d.otherParties.length > 0 || d.incidentType === 'THEFT' || d.incidentType === 'HIT_AND_RUN';
    if (needsPolice) reqs.push(field('policeReportNumber', 'Police report number', d.policeReportNumber));
  } else if (d.kind === 'PROPERTY') {
    reqs.push(field('propertyAddress', 'Property address', d.propertyAddress));
    reqs.push(field('areasAffected', 'Rooms / areas affected', d.areasAffected));
    if (d.damageType === 'THEFT' || d.damageType === 'VANDALISM')
      reqs.push(field('itemsStolenOrDamaged', 'List of items stolen or damaged', d.itemsStolenOrDamaged));
    else reqs.push(field('contractorName', 'Contractor name', d.contractorName, false));
  } else {
    reqs.push(field('memberId', 'Member ID', d.memberId));
    reqs.push(field('patientName', 'Patient name & DOB', d.patientName && d.patientDob ? 'ok' : ''));
    reqs.push(field('provider', 'Provider name & NPI', d.provider.name && /^\d{10}$/.test(d.provider.npi) ? 'ok' : ''));
    reqs.push(
      field(
        'serviceLines',
        'Procedure & diagnosis codes with billed amounts',
        d.lines.length > 0 && d.lines.every((l) => l.procedureCode && l.diagnosisCode && l.billedAmount > 0) ? 'ok' : '',
      ),
    );
  }

  for (const doc of requiredDocumentCategories(claim.claimType, d)) {
    reqs.push({
      key: `doc:${doc.category}`,
      label: doc.label,
      kind: 'document',
      category: doc.category,
      required: doc.required,
      satisfied: claim.documents.some((x) => x.category === doc.category),
    });
  }
  return reqs;
}

export function missingRequiredDocuments(claim: ClaimLike): Requirement[] {
  return getRequirements(claim).filter((r) => r.kind === 'document' && r.required && !r.satisfied);
}

export function missingRequiredFields(claim: ClaimLike): Requirement[] {
  return getRequirements(claim).filter((r) => r.kind === 'field' && r.required && !r.satisfied);
}
