import type { ClaimDocument, DocumentCategory, Policy } from '../types';
import type { EvaluableClaim } from '../rulesEngine';

export const autoPolicy: Policy = {
  policyNumber: 'POL-100245',
  customerId: 'C-1',
  type: 'AUTO',
  status: 'ACTIVE',
  effectiveDate: '2026-03-01',
  expiryDate: '2027-02-28',
  premium: 1420,
  deductible: 500,
  coverages: [
    { name: 'Collision', limit: 25000 },
    { name: 'Comprehensive', limit: 25000 },
    { name: 'Liability', limit: 100000 },
  ],
  exclusions: ['RACING'],
  vehicles: [{ year: 2022, make: 'Toyota', model: 'RAV4', vin: '2T3P1RFV8NW123456' }],
};

export const homePolicy: Policy = {
  policyNumber: 'POL-200318',
  customerId: 'C-1',
  type: 'HOME',
  status: 'ACTIVE',
  effectiveDate: '2025-11-15',
  expiryDate: '2026-11-14',
  premium: 2100,
  deductible: 1000,
  coverages: [
    { name: 'Dwelling', limit: 350000 },
    { name: 'Personal Property', limit: 10000 },
  ],
  exclusions: ['FLOOD', 'EARTHQUAKE', 'MOLD'],
  propertyAddress: '418 Maple Ave, Austin, TX 78704',
};

export const healthPolicy: Policy = {
  policyNumber: 'POL-300577',
  customerId: 'C-1',
  type: 'HEALTH',
  status: 'ACTIVE',
  effectiveDate: '2026-01-01',
  expiryDate: '2026-12-31',
  premium: 6200,
  deductible: 1500,
  coverages: [
    { name: 'Office Visits', limit: 0 },
    { name: 'Urgent Care', limit: 0 },
    { name: 'Diagnostic Imaging', limit: 0 },
    { name: 'Laboratory', limit: 0 },
    { name: 'Outpatient Surgery', limit: 0 },
  ],
  exclusions: ['Cosmetic'],
  health: { copay: 30, coinsurance: 0.2, outOfPocketMax: 6000, deductibleMet: 1200, outOfPocketMet: 1800 },
  members: [{ memberId: 'MBR-778812', name: 'Maria Lopez', dob: '1988-04-12', relationship: 'SUBSCRIBER', eligible: true }],
};

export const doc = (category: DocumentCategory): ClaimDocument => ({
  id: `d-${category}`,
  category,
  fileName: `${category.toLowerCase()}.pdf`,
  sizeBytes: 1000,
  mimeType: 'application/pdf',
  uploadedBy: 'test',
  uploadedAt: '2026-09-01T00:00:00Z',
});

export function autoClaim(overrides: Partial<EvaluableClaim> = {}): EvaluableClaim {
  return {
    claimNumber: 'CLM-2026-000900',
    policyNumber: 'POL-100245',
    claimType: 'AUTO',
    dateOfLoss: '2026-09-20',
    location: { city: 'Austin', state: 'TX' },
    incidentDescription: 'Rear-ended at a stop light on Lamar Blvd; bumper and trunk damaged.',
    estimatedAmount: 3200,
    estimatedFields: [],
    documents: [doc('PHOTO'), doc('REPAIR_ESTIMATE'), doc('POLICE_REPORT')],
    details: {
      kind: 'AUTO',
      incidentType: 'COLLISION',
      vehicle: { year: 2022, make: 'Toyota', model: 'RAV4', vin: '2T3P1RFV8NW123456', damage: 'Rear bumper, trunk lid' },
      drivable: true,
      injuries: false,
      otherParties: [{ name: 'John Reed', insurer: 'Acme Mutual', atFault: 'YES' }],
      policeReportNumber: 'APD-26-55120',
    },
    tags: [],
    expertInputs: [],
    createdAt: '2026-09-21T10:00:00Z',
    ...overrides,
  };
}

export function healthClaim(overrides: Partial<EvaluableClaim> = {}): EvaluableClaim {
  return {
    claimNumber: 'CLM-2026-000901',
    policyNumber: 'POL-300577',
    claimType: 'HEALTH',
    dateOfLoss: '2026-09-10',
    location: { city: 'Austin', state: 'TX' },
    incidentDescription: 'Knee pain after fall; MRI ordered to rule out meniscus tear.',
    estimatedAmount: 1400,
    estimatedFields: [],
    documents: [doc('INVOICE'), doc('MEDICAL_RECORD')],
    details: {
      kind: 'HEALTH',
      memberId: 'MBR-778812',
      patientName: 'Maria Lopez',
      patientDob: '1988-04-12',
      provider: { name: 'Lakeside Medical Group', npi: '1234567893', taxId: '74-1234567' },
      serviceType: 'POST_SERVICE',
      placeOfService: '22',
      lines: [
        { procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 250 },
        { procedureCode: '73721', diagnosisCode: 'M25.561', units: 1, billedAmount: 1150 },
      ],
    },
    tags: [],
    expertInputs: [],
    createdAt: '2026-09-12T10:00:00Z',
    ...overrides,
  };
}
