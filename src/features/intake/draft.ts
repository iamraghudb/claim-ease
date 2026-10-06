import { POLICY_TO_CLAIM_TYPE } from '../../domain/catalog';
import type { ClaimLike } from '../../domain/requirements';
import type { AutoDetails, ClaimDetails, ClaimType, Customer, HealthDetails, Policy, PropertyDetails, Role } from '../../domain/types';
import type { PendingDoc } from '../../components/Documents';
import { PERSONAS } from '../../services';

export interface IntakeDraft {
  policyNumber: string;
  policy?: Policy;
  customer?: Customer;
  claimType: ClaimType;
  dateOfLoss: string;
  location: { city: string; state: string };
  incidentDescription: string;
  estimatedAmount: string;
  estimatedFields: string[];
  catastrophe: boolean;
  auto: AutoDetails;
  property: PropertyDetails;
  health: HealthDetails;
  documents: PendingDoc[];
}

export function emptyDraft(role: Role): IntakeDraft {
  const provider = PERSONAS.PROVIDER;
  return {
    policyNumber: '',
    claimType: role === 'PROVIDER' ? 'HEALTH' : 'AUTO',
    dateOfLoss: '',
    location: { city: '', state: '' },
    incidentDescription: '',
    estimatedAmount: '',
    estimatedFields: [],
    catastrophe: false,
    auto: {
      kind: 'AUTO',
      incidentType: 'COLLISION',
      vehicle: { make: '', model: '', damage: '' },
      drivable: true,
      injuries: false,
      otherParties: [],
      policeReportNumber: '',
    },
    property: { kind: 'PROPERTY', damageType: 'WATER', propertyAddress: '', areasAffected: '', habitable: true, contractorName: '', itemsStolenOrDamaged: '' },
    health: {
      kind: 'HEALTH',
      memberId: '',
      patientName: '',
      patientDob: '',
      provider: { name: provider.providerName ?? '', npi: role === 'PROVIDER' ? '1234567893' : '', taxId: role === 'PROVIDER' ? '74-1234567' : '' },
      serviceType: 'POST_SERVICE',
      placeOfService: '11',
      lines: [{ procedureCode: '', diagnosisCode: '', units: 1, billedAmount: 0 }],
    },
    documents: [],
  };
}

/** Pre-fill type-specific details from the policy that was looked up. */
export function applyPolicy(d: IntakeDraft, policy: Policy, customer: Customer): IntakeDraft {
  const claimType = POLICY_TO_CLAIM_TYPE[policy.type];
  const next: IntakeDraft = { ...d, policy, customer, policyNumber: policy.policyNumber, claimType };
  const [city, stateZip] = (policy.propertyAddress ?? customer.contact.address).split(',').slice(-2).map((s) => s.trim());
  if (!next.location.city && city) next.location = { city, state: (stateZip ?? '').split(' ')[0] };
  if (claimType === 'AUTO' && policy.vehicles?.[0] && !d.auto.vehicle.make) {
    const v = policy.vehicles[0];
    next.auto = { ...d.auto, vehicle: { ...d.auto.vehicle, year: v.year, make: v.make, model: v.model, vin: v.vin } };
  }
  if (claimType === 'PROPERTY' && !d.property.propertyAddress) next.property = { ...d.property, propertyAddress: policy.propertyAddress ?? '' };
  return next;
}

export function draftDetails(d: IntakeDraft): ClaimDetails {
  if (d.claimType === 'AUTO') return d.auto;
  if (d.claimType === 'PROPERTY') return d.property;
  return d.health;
}

export function draftAmount(d: IntakeDraft): number {
  if (d.claimType === 'HEALTH') return d.health.lines.reduce((s, l) => s + (Number(l.billedAmount) || 0), 0);
  return Number(d.estimatedAmount) || 0;
}

export function draftToClaimLike(d: IntakeDraft): ClaimLike & { policyNumber: string; tags: string[]; claimantName: string } {
  return {
    policyNumber: d.policyNumber,
    claimType: d.claimType,
    claimantName: d.claimType === 'HEALTH' ? d.health.patientName : d.customer?.name ?? '',
    dateOfLoss: d.dateOfLoss,
    location: d.location,
    incidentDescription: d.incidentDescription,
    estimatedAmount: draftAmount(d),
    estimatedFields: d.estimatedFields,
    documents: d.documents.map((x, i) => ({ ...x, id: `draft-${i}`, uploadedBy: '', uploadedAt: '' })),
    details: draftDetails(d),
    tags: d.catastrophe ? ['CATASTROPHE'] : [],
  };
}

export function toggleEstimated(d: IntakeDraft, key: string, on: boolean): IntakeDraft {
  const set = new Set(d.estimatedFields);
  if (on) set.add(key);
  else set.delete(key);
  return { ...d, estimatedFields: [...set] };
}
