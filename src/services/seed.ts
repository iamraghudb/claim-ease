import { DEFAULT_RULES_CONFIG } from '../domain/config';
import { formatClaimNumber } from '../domain/claimNumber';
import { evaluateClaim } from '../domain/rulesEngine';
import { computeSlaDueDate } from '../domain/sla';
import type {
  AppNotification,
  AuditEntry,
  Claim,
  ClaimDetails,
  ClaimDocument,
  ClaimStatus,
  ClaimType,
  Customer,
  DocumentCategory,
  Policy,
  Role,
  RulesConfig,
} from '../domain/types';
import { placeholderImage } from './placeholders';

// Seed data is generated relative to "now" so SLA countdowns and policy
// periods always look realistic, whenever the demo is run.

const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface Database {
  customers: Customer[];
  policies: Policy[];
  claims: Claim[];
  notifications: AppNotification[];
  config: RulesConfig;
  adjusters: string[];
}

export const PERSONAS: Record<Role, { name: string; title: string; customerId?: string; providerName?: string }> = {
  CLAIMANT: { name: 'Maria Lopez', title: 'Policyholder', customerId: 'C-1001' },
  PROVIDER: { name: 'Dr. Priya Shah', title: 'Lakeside Medical Group', providerName: 'Lakeside Medical Group' },
  ADJUSTER: { name: 'Alex Chen', title: 'Senior Claims Adjuster' },
  ADMIN: { name: 'Jordan Rivera', title: 'Claims Operations Admin' },
};

export const ADJUSTERS = ['Alex Chen', 'Sam Patel', 'Riley Morgan'];

let idCounter = 0;
export const uid = (prefix = 'id') => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export function buildSeed(now: Date = new Date()): Database {
  const t = now.getTime();
  const iso = (ms: number) => new Date(ms).toISOString();
  const ago = (days: number, hours = 0) => t - days * DAY - hours * HOUR;
  const dateOnly = (ms: number) => iso(ms).slice(0, 10);
  const addMonths = (ms: number, months: number) => {
    const d = new Date(ms);
    d.setMonth(d.getMonth() + months);
    return d.getTime();
  };

  const customers: Customer[] = [
    {
      id: 'C-1001',
      name: 'Maria Lopez',
      contact: { email: 'maria.lopez@example.com', phone: '(512) 555-0143', address: '418 Maple Ave, Austin, TX 78704' },
    },
    {
      id: 'C-1002',
      name: 'David Kim',
      contact: { email: 'david.kim@example.com', phone: '(312) 555-0199', address: '77 W Lake St Apt 9, Chicago, IL 60601' },
    },
  ];

  const autoStart = addMonths(t, -7);
  const homeStart = addMonths(t, -10);
  const healthStart = addMonths(t, -9);

  const policies: Policy[] = [
    {
      policyNumber: 'POL-100245',
      customerId: 'C-1001',
      type: 'AUTO',
      status: 'ACTIVE',
      effectiveDate: dateOnly(autoStart),
      expiryDate: dateOnly(addMonths(autoStart, 12) - DAY),
      premium: 1420,
      deductible: 500,
      coverages: [
        { name: 'Collision', limit: 25000 },
        { name: 'Comprehensive', limit: 25000 },
        { name: 'Liability', limit: 100000 },
        { name: 'Medical Payments', limit: 5000 },
      ],
      exclusions: ['RACING', 'COMMERCIAL_USE'],
      vehicles: [{ year: 2022, make: 'Toyota', model: 'RAV4', vin: '2T3P1RFV8NW123456' }],
    },
    {
      policyNumber: 'POL-200318',
      customerId: 'C-1001',
      type: 'HOME',
      status: 'ACTIVE',
      effectiveDate: dateOnly(homeStart),
      expiryDate: dateOnly(addMonths(homeStart, 12) - DAY),
      premium: 2100,
      deductible: 1000,
      coverages: [
        { name: 'Dwelling', limit: 350000 },
        { name: 'Personal Property', limit: 10000 },
        { name: 'Loss of Use', limit: 20000 },
        { name: 'Personal Liability', limit: 300000 },
      ],
      exclusions: ['FLOOD', 'EARTHQUAKE', 'MOLD'],
      propertyAddress: '418 Maple Ave, Austin, TX 78704',
    },
    {
      policyNumber: 'POL-300577',
      customerId: 'C-1001',
      type: 'HEALTH',
      status: 'ACTIVE',
      effectiveDate: dateOnly(healthStart),
      expiryDate: dateOnly(addMonths(healthStart, 12) - DAY),
      premium: 6200,
      deductible: 1500,
      coverages: [
        { name: 'Office Visits', limit: 0 },
        { name: 'Urgent Care', limit: 0 },
        { name: 'Diagnostic Imaging', limit: 0 },
        { name: 'Laboratory', limit: 0 },
        { name: 'Outpatient Surgery', limit: 0 },
        { name: 'Rehabilitation', limit: 0 },
        { name: 'Dental', limit: 0 },
        { name: 'Vision', limit: 0 },
      ],
      exclusions: ['Cosmetic'],
      health: { copay: 30, coinsurance: 0.2, outOfPocketMax: 6000, deductibleMet: 1200, outOfPocketMet: 1800 },
      members: [
        { memberId: 'MBR-778812', name: 'Maria Lopez', dob: '1988-04-12', relationship: 'SUBSCRIBER', eligible: true },
        { memberId: 'MBR-778813', name: 'Lucas Lopez', dob: '2015-09-30', relationship: 'DEPENDENT', eligible: true },
      ],
    },
    // A lapsed policy to demonstrate lookup validation.
    {
      policyNumber: 'POL-400112',
      customerId: 'C-1002',
      type: 'RENTERS',
      status: 'LAPSED',
      effectiveDate: dateOnly(addMonths(t, -20)),
      expiryDate: dateOnly(addMonths(t, -8)),
      premium: 240,
      deductible: 500,
      coverages: [
        { name: 'Personal Property', limit: 25000 },
        { name: 'Personal Liability', limit: 100000 },
      ],
      exclusions: ['FLOOD', 'EARTHQUAKE'],
      propertyAddress: '77 W Lake St Apt 9, Chicago, IL 60601',
    },
  ];

  const lakeside = { name: 'Lakeside Medical Group', npi: '1234567893', taxId: '74-1234567', facility: 'Lakeside Clinic – South Austin' };
  const claims: Claim[] = [];

  interface Spec {
    seq: number;
    policyNumber: string;
    claimType: ClaimType;
    initiatorRole: Role;
    claimantName: string;
    createdDaysAgo: number;
    lossDaysAgo: number;
    location: { city: string; state: string };
    description: string;
    amount: number;
    estimatedFields?: string[];
    details: ClaimDetails;
    docs: [DocumentCategory, string][];
    path: [ClaimStatus, number, string?, string?][]; // status, hours after creation, actor, details
    assignedAdjuster?: string;
    tags?: string[];
    extra?: (c: Claim, at: (h: number) => string) => void;
  }

  const make = (s: Spec) => {
    const created = ago(s.createdDaysAgo);
    const at = (h: number) => iso(created + h * HOUR);
    const filer = s.initiatorRole === 'PROVIDER' ? PERSONAS.PROVIDER.name : s.claimantName;
    const documents: ClaimDocument[] = s.docs.map(([category, name], i) => ({
      id: `doc-${s.seq}-${i}`,
      category,
      fileName: name,
      sizeBytes: 180_000 + i * 53_211,
      mimeType: category === 'PHOTO' ? 'image/svg+xml' : category === 'VIDEO' ? 'video/mp4' : 'application/pdf',
      uploadedBy: filer,
      uploadedAt: at(0.2),
      previewUrl: category === 'PHOTO' ? placeholderImage(name.replace(/\.\w+$/, '').replace(/[-_]/g, ' '), s.seq + i) : undefined,
    }));
    const audit: AuditEntry[] = [];
    let prev: ClaimStatus | undefined;
    for (const [status, h, actor, details] of s.path) {
      const isSystem = !actor;
      audit.push({
        id: `aud-${s.seq}-${audit.length}`,
        timestamp: at(h),
        actor: actor ?? (status === 'REPORTED' ? filer : 'ClaimEase'),
        role: isSystem ? (status === 'REPORTED' ? s.initiatorRole : 'SYSTEM') : actor === filer ? s.initiatorRole : 'ADJUSTER',
        action: prev ? 'Status changed' : 'Claim reported (FNOL)',
        fromStatus: prev,
        toStatus: status,
        details,
      });
      if (status === 'REPORTED') {
        audit.push({
          id: `aud-${s.seq}-${audit.length}`,
          timestamp: at(h + 0.2),
          actor: filer,
          role: s.initiatorRole,
          action: 'Documents uploaded',
          details: `${documents.length} file(s): ${documents.map((d) => d.fileName).join(', ')}`,
        });
      }
      prev = status;
    }
    const claim: Claim = {
      id: `claim-${s.seq}`,
      claimNumber: formatClaimNumber(new Date(created).getFullYear(), s.seq),
      policyNumber: s.policyNumber,
      claimType: s.claimType,
      initiatorRole: s.initiatorRole,
      claimantName: s.claimantName,
      dateOfLoss: dateOnly(ago(s.lossDaysAgo)),
      location: s.location,
      incidentDescription: s.description,
      estimatedAmount: s.amount,
      estimatedFields: s.estimatedFields ?? [],
      details: s.details,
      documents,
      status: prev!,
      assignedAdjuster: s.assignedAdjuster,
      notes: [],
      communicationLog: [],
      informationRequests: [],
      expertInputs: [],
      decisionHistory: [],
      appeals: [],
      auditTrail: audit,
      tags: s.tags ?? [],
      createdAt: iso(created),
      updatedAt: audit[audit.length - 1].timestamp,
      slaStartedAt: iso(created),
      slaDueDate: '',
    };
    if (s.assignedAdjuster) {
      const regIdx = audit.findIndex((a) => a.toStatus === 'REGISTERED');
      audit.splice(regIdx + 1, 0, {
        id: `aud-${s.seq}-assign`,
        timestamp: audit[regIdx].timestamp,
        actor: 'ClaimEase',
        role: 'SYSTEM',
        action: 'Assigned',
        details: `Assigned to ${s.assignedAdjuster}`,
      });
    }
    s.extra?.(claim, at);
    const policy = policies.find((p) => p.policyNumber === s.policyNumber);
    const result = evaluateClaim(claim, policy, { otherClaims: claims, now });
    claim.slaDueDate = computeSlaDueDate(
      {
        claimType: claim.claimType,
        createdAt: claim.createdAt,
        complexity: result.complexity,
        healthServiceType: claim.details.kind === 'HEALTH' ? claim.details.serviceType : undefined,
      },
      DEFAULT_RULES_CONFIG,
    );
    claims.push(claim);
    return claim;
  };

  const austin = { city: 'Austin', state: 'TX' };
  const rav4 = { year: 2022, make: 'Toyota', model: 'RAV4', vin: '2T3P1RFV8NW123456' };

  // 1. REGISTERED — burst pipe, awaiting assignment
  make({
    seq: 101,
    policyNumber: 'POL-200318',
    claimType: 'PROPERTY',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 1,
    lossDaysAgo: 2,
    location: austin,
    description: 'Supply line under the kitchen sink burst overnight. Water spread across kitchen and into the hallway; cabinets and flooring are soaked.',
    amount: 6800,
    details: {
      kind: 'PROPERTY',
      damageType: 'WATER',
      propertyAddress: '418 Maple Ave, Austin, TX 78704',
      areasAffected: 'Kitchen, hallway',
      habitable: true,
      contractorName: 'Hill Country Restoration',
    },
    docs: [
      ['PHOTO', 'kitchen-floor.jpg'],
      ['PHOTO', 'sink-cabinet.jpg'],
      ['REPAIR_ESTIMATE', 'hill-country-estimate.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
    ],
  });

  // 2. UNDER_REVIEW — windshield, fast-track eligible
  make({
    seq: 102,
    policyNumber: 'POL-100245',
    claimType: 'AUTO',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 2,
    lossDaysAgo: 3,
    location: austin,
    description: 'Rock kicked up by a truck on I-35 cracked the windshield on the driver side. No other damage.',
    amount: 650,
    details: {
      kind: 'AUTO',
      incidentType: 'GLASS',
      vehicle: { ...rav4, damage: 'Windshield crack, ~14 inches' },
      drivable: true,
      injuries: false,
      otherParties: [],
    },
    docs: [
      ['PHOTO', 'windshield-crack.jpg'],
      ['REPAIR_ESTIMATE', 'safelite-quote.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 20, 'Alex Chen'],
    ],
    assignedAdjuster: 'Alex Chen',
  });

  // 3. INFORMATION_REQUIRED — storm roof damage (catastrophe)
  make({
    seq: 103,
    policyNumber: 'POL-200318',
    claimType: 'PROPERTY',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 6,
    lossDaysAgo: 7,
    location: austin,
    description: 'Severe thunderstorm with high winds tore shingles off the south side of the roof. Water stain appearing on the bedroom ceiling.',
    amount: 14500,
    estimatedFields: ['estimatedAmount'],
    details: {
      kind: 'PROPERTY',
      damageType: 'WIND',
      propertyAddress: '418 Maple Ave, Austin, TX 78704',
      areasAffected: 'Roof (south slope), primary bedroom ceiling',
      habitable: true,
    },
    docs: [
      ['PHOTO', 'roof-south-slope.jpg'],
      ['PHOTO', 'bedroom-ceiling-stain.jpg'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 26, 'Sam Patel'],
      ['INFORMATION_REQUIRED', 50, 'Sam Patel', 'Requested: Contractor estimate, Walk-through video'],
    ],
    assignedAdjuster: 'Sam Patel',
    tags: ['CATASTROPHE'],
    extra: (c, at) => {
      c.informationRequests.push({
        id: 'ir-103',
        requestedAt: at(50),
        requestedBy: 'Sam Patel',
        message: 'Thanks for the photos. To finish our review we need a written roofing estimate and a short video showing the ceiling damage.',
        items: [
          { id: 'iri-103-1', label: 'Contractor estimate', category: 'REPAIR_ESTIMATE', reason: 'MISSING_DOCUMENTS', fulfilled: false },
          { id: 'iri-103-2', label: 'Walk-through video of interior damage', category: 'VIDEO', reason: 'MISSING_DOCUMENTS', fulfilled: false },
        ],
      });
      c.communicationLog.push({
        id: 'cl-103-1',
        date: at(30),
        contactPerson: 'Sam Patel (adjuster)',
        channel: 'CALL',
        summary: 'Adjuster called to confirm the roof is tarped. Advised to keep receipts for the tarp.',
        requestedItems: 'Roofing estimate',
        response: 'Will contact two roofers this week.',
        loggedBy: 'Maria Lopez',
        loggedByRole: 'CLAIMANT',
      });
    },
  });

  // 4. INVESTIGATION — intersection collision, unclear liability, high value, injury
  make({
    seq: 104,
    policyNumber: 'POL-100245',
    claimType: 'AUTO',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 9,
    lossDaysAgo: 10,
    location: { city: 'Round Rock', state: 'TX' },
    description: 'T-bone collision at the intersection of Main St and Mays St. Both drivers say they had a green light. Passenger-side doors crushed, airbags deployed.',
    amount: 18400,
    details: {
      kind: 'AUTO',
      incidentType: 'COLLISION',
      vehicle: { ...rav4, damage: 'Passenger doors, B-pillar, airbags deployed' },
      drivable: false,
      injuries: true,
      otherParties: [{ name: 'Kevin Brooks', phone: '(512) 555-0177', insurer: 'Lone Star Mutual', policyNumber: 'LSM-88213', vehicle: '2019 Ford F-150', atFault: 'UNKNOWN' }],
      policeReportNumber: 'RRPD-2026-11873',
    },
    docs: [
      ['PHOTO', 'passenger-side.jpg'],
      ['PHOTO', 'intersection.jpg'],
      ['POLICE_REPORT', 'rrpd-report-11873.pdf'],
      ['REPAIR_ESTIMATE', 'caliber-collision-estimate.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 8, 'Alex Chen'],
      ['INVESTIGATION', 30, 'Alex Chen', 'Conflicting statements on signal; high value with injury.'],
    ],
    assignedAdjuster: 'Alex Chen',
    extra: (c, at) => {
      c.expertInputs.push(
        { id: 'ex-104-1', expertType: 'APPRAISER', expertName: 'Precision Auto Appraisals', status: 'RECEIVED', requestedAt: at(31), receivedAt: at(96), summary: 'Vehicle repairable; frame within tolerance. Agrees with estimate minus $900 for prior bumper damage.', recommendedAmount: 17500 },
        { id: 'ex-104-2', expertType: 'REPAIR_SHOP', expertName: 'Traffic camera footage request (City of Round Rock)', status: 'PENDING', requestedAt: at(32) },
      );
      c.notes.push({ id: 'n-104-1', author: 'Alex Chen', role: 'ADJUSTER', createdAt: at(31), text: 'Requested intersection camera footage. Other carrier (Lone Star Mutual) disputes liability.' });
    },
  });

  // 5. ADJUDICATION — post-service MRI submitted by provider
  make({
    seq: 105,
    policyNumber: 'POL-300577',
    claimType: 'HEALTH',
    initiatorRole: 'PROVIDER',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 5,
    lossDaysAgo: 8,
    location: austin,
    description: 'Established patient with right knee pain after a fall while running. MRI performed to rule out meniscus tear.',
    amount: 1400,
    details: {
      kind: 'HEALTH',
      memberId: 'MBR-778812',
      patientName: 'Maria Lopez',
      patientDob: '1988-04-12',
      provider: lakeside,
      serviceType: 'POST_SERVICE',
      placeOfService: '22',
      lines: [
        { procedureCode: '99214', diagnosisCode: 'M25.561', units: 1, billedAmount: 250 },
        { procedureCode: '73721', diagnosisCode: 'S83.241A', units: 1, billedAmount: 1150 },
      ],
    },
    docs: [
      ['INVOICE', 'cms1500-lopez.pdf'],
      ['MEDICAL_RECORD', 'mri-order-clinical-notes.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 20, 'Riley Morgan'],
      ['ADJUDICATION', 44, 'Riley Morgan'],
    ],
    assignedAdjuster: 'Riley Morgan',
  });

  // 6. PARTIALLY_APPROVED — hail damage
  make({
    seq: 106,
    policyNumber: 'POL-100245',
    claimType: 'AUTO',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 20,
    lossDaysAgo: 22,
    location: austin,
    description: 'Hail storm while parked at work. Dozens of dents on hood, roof and trunk; small dent on rear door.',
    amount: 7200,
    details: {
      kind: 'AUTO',
      incidentType: 'WEATHER',
      vehicle: { ...rav4, damage: 'Hail dents on hood, roof, trunk; rear door dent' },
      drivable: true,
      injuries: false,
      otherParties: [],
    },
    docs: [
      ['PHOTO', 'hood-hail.jpg'],
      ['PHOTO', 'roof-hail.jpg'],
      ['REPAIR_ESTIMATE', 'pdr-estimate.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 18, 'Alex Chen'],
      ['ADJUDICATION', 120, 'Alex Chen'],
      ['PARTIALLY_APPROVED', 150, 'Alex Chen', 'Approved $5,400 of $6,700 payable'],
    ],
    assignedAdjuster: 'Alex Chen',
    extra: (c, at) => {
      c.decision = {
        outcome: 'PARTIALLY_APPROVED',
        calculatedAmount: 6700,
        approvedAmount: 5400,
        overrideReason: 'Rear door dent predates the hail event per prior inspection photos.',
        explanation: 'Hail damage to hood, roof and trunk is covered under Comprehensive. The rear door dent is pre-existing and not included.',
        decidedBy: 'Alex Chen',
        decidedAt: at(150),
      };
      c.decisionHistory.push(c.decision);
      c.decidedAt = at(150);
    },
  });

  // 7. DENIED — basement flood (excluded)
  make({
    seq: 107,
    policyNumber: 'POL-200318',
    claimType: 'PROPERTY',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 25,
    lossDaysAgo: 26,
    location: austin,
    description: 'Heavy rain caused the creek behind the house to overflow; rising water entered the basement and damaged the water heater and drywall.',
    amount: 18000,
    details: {
      kind: 'PROPERTY',
      damageType: 'FLOOD',
      propertyAddress: '418 Maple Ave, Austin, TX 78704',
      areasAffected: 'Basement, water heater',
      habitable: true,
      contractorName: 'Capital Drywall & Plumbing',
    },
    docs: [
      ['PHOTO', 'basement-waterline.jpg'],
      ['REPAIR_ESTIMATE', 'capital-drywall-estimate.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 22, 'Sam Patel'],
      ['ADJUDICATION', 100, 'Sam Patel'],
      ['DENIED', 190, 'Sam Patel', 'D02 — Loss excluded under policy terms'],
    ],
    assignedAdjuster: 'Sam Patel',
    extra: (c, at) => {
      c.decision = {
        outcome: 'DENIED',
        calculatedAmount: 0,
        approvedAmount: 0,
        denialReasonCode: 'D02',
        explanation: 'Damage from rising surface water (flood) is excluded under the homeowners policy. Flood coverage is available through the NFIP or a private flood policy.',
        decidedBy: 'Sam Patel',
        decidedAt: at(190),
      };
      c.decisionHistory.push(c.decision);
      c.decidedAt = at(190);
    },
  });

  // 8. PAYMENT_PENDING — urgent care
  make({
    seq: 108,
    policyNumber: 'POL-300577',
    claimType: 'HEALTH',
    initiatorRole: 'PROVIDER',
    claimantName: 'Lucas Lopez',
    createdDaysAgo: 3,
    lossDaysAgo: 3,
    location: austin,
    description: 'Pediatric urgent care visit for persistent cough and fever; chest X-ray to rule out pneumonia. Negative.',
    amount: 395,
    details: {
      kind: 'HEALTH',
      memberId: 'MBR-778813',
      patientName: 'Lucas Lopez',
      patientDob: '2015-09-30',
      provider: lakeside,
      serviceType: 'URGENT',
      placeOfService: '20',
      lines: [
        { procedureCode: 'S9083', diagnosisCode: 'J06.9', units: 1, billedAmount: 240 },
        { procedureCode: '71046', diagnosisCode: 'J06.9', units: 1, billedAmount: 155 },
      ],
    },
    docs: [['INVOICE', 'urgent-care-bill.pdf']],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 2, 'Riley Morgan'],
      ['ADJUDICATION', 6, 'Riley Morgan'],
      ['APPROVED', 9, 'Riley Morgan'],
      ['PAYMENT_PENDING', 9.2, 'Riley Morgan'],
    ],
    assignedAdjuster: 'Riley Morgan',
    extra: (c, at) => {
      c.decision = {
        outcome: 'APPROVED',
        calculatedAmount: 150,
        approvedAmount: 150,
        explanation: 'Urgent care visit and X-ray covered. Copay and coinsurance applied per plan.',
        decidedBy: 'Riley Morgan',
        decidedAt: at(9),
      };
      c.decisionHistory.push(c.decision);
      c.decidedAt = at(9);
    },
  });

  // 9. PAID — physical therapy
  make({
    seq: 109,
    policyNumber: 'POL-300577',
    claimType: 'HEALTH',
    initiatorRole: 'PROVIDER',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 18,
    lossDaysAgo: 20,
    location: austin,
    description: 'Follow-up office visit and physical therapy session for right knee strain.',
    amount: 310,
    details: {
      kind: 'HEALTH',
      memberId: 'MBR-778812',
      patientName: 'Maria Lopez',
      patientDob: '1988-04-12',
      provider: lakeside,
      serviceType: 'POST_SERVICE',
      placeOfService: '11',
      lines: [
        { procedureCode: '99213', diagnosisCode: 'M25.561', units: 1, billedAmount: 160 },
        { procedureCode: '97110', diagnosisCode: 'M25.561', units: 3, billedAmount: 150 },
      ],
    },
    docs: [['INVOICE', 'pt-visit-bill.pdf']],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 10, 'Riley Morgan'],
      ['ADJUDICATION', 30, 'Riley Morgan'],
      ['APPROVED', 50, 'Riley Morgan'],
      ['PAYMENT_PENDING', 50.2, 'Riley Morgan'],
      ['PAID', 98, 'Riley Morgan', 'EFT · ref EFT-55310'],
    ],
    assignedAdjuster: 'Riley Morgan',
    extra: (c, at) => {
      c.decision = {
        outcome: 'APPROVED',
        calculatedAmount: 80,
        approvedAmount: 80,
        explanation: 'Covered services; copay and coinsurance applied.',
        decidedBy: 'Riley Morgan',
        decidedAt: at(50),
      };
      c.decisionHistory.push(c.decision);
      c.decidedAt = at(50);
      c.payment = { method: 'EFT', amount: 80, date: at(98).slice(0, 10), reference: 'EFT-55310', issuedBy: 'Riley Morgan' };
    },
  });

  // 10. CLOSED — vandalism
  make({
    seq: 110,
    policyNumber: 'POL-100245',
    claimType: 'AUTO',
    initiatorRole: 'CLAIMANT',
    claimantName: 'Maria Lopez',
    createdDaysAgo: 60,
    lossDaysAgo: 61,
    location: austin,
    description: 'Car was keyed along the driver side while parked downtown overnight. Reported to police the next morning.',
    amount: 2100,
    details: {
      kind: 'AUTO',
      incidentType: 'VANDALISM',
      vehicle: { ...rav4, damage: 'Deep scratches, driver side doors and fender' },
      drivable: true,
      injuries: false,
      otherParties: [],
      policeReportNumber: 'APD-26-40211',
    },
    docs: [
      ['PHOTO', 'driver-side-scratch.jpg'],
      ['REPAIR_ESTIMATE', 'paint-shop-estimate.pdf'],
      ['POLICE_REPORT', 'apd-40211.pdf'],
    ],
    path: [
      ['REPORTED', 0],
      ['REGISTERED', 0.1],
      ['UNDER_REVIEW', 12, 'Alex Chen'],
      ['ADJUDICATION', 30, 'Alex Chen', 'Fast-track'],
      ['APPROVED', 36, 'Alex Chen'],
      ['PAYMENT_PENDING', 36.2, 'Alex Chen'],
      ['PAID', 60, 'Alex Chen', 'ACH · ref ACH-90122'],
      ['CLOSED', 200, 'Alex Chen'],
    ],
    assignedAdjuster: 'Alex Chen',
    extra: (c, at) => {
      c.decision = {
        outcome: 'APPROVED',
        calculatedAmount: 1600,
        approvedAmount: 1600,
        explanation: 'Vandalism covered under Comprehensive; $500 deductible applied.',
        decidedBy: 'Alex Chen',
        decidedAt: at(36),
      };
      c.decisionHistory.push(c.decision);
      c.decidedAt = at(36);
      c.payment = { method: 'ACH', amount: 1600, date: at(60).slice(0, 10), reference: 'ACH-90122', issuedBy: 'Alex Chen' };
    },
  });

  const notifications: AppNotification[] = [
    {
      id: 'nt-1',
      claimNumber: claims[2].claimNumber,
      audience: ['CLAIMANT'],
      type: 'INFO_REQUEST',
      title: 'Information requested',
      message: `${claims[2].claimNumber}: please upload a contractor estimate and a walk-through video.`,
      createdAt: claims[2].auditTrail.at(-1)!.timestamp,
      read: false,
    },
    {
      id: 'nt-2',
      claimNumber: claims[5].claimNumber,
      audience: ['CLAIMANT'],
      type: 'DECISION',
      title: 'Claim partially approved',
      message: `${claims[5].claimNumber}: $5,400 approved. You can review the explanation or file an appeal.`,
      createdAt: claims[5].decidedAt!,
      read: false,
    },
    {
      id: 'nt-3',
      claimNumber: claims[7].claimNumber,
      audience: ['CLAIMANT', 'PROVIDER'],
      type: 'DECISION',
      title: 'Claim approved',
      message: `${claims[7].claimNumber}: urgent care claim approved; payment is being prepared.`,
      createdAt: claims[7].decidedAt!,
      read: true,
    },
    {
      id: 'nt-4',
      claimNumber: claims[8].claimNumber,
      audience: ['CLAIMANT', 'PROVIDER'],
      type: 'PAYMENT',
      title: 'Payment issued',
      message: `${claims[8].claimNumber}: $80.00 paid by EFT to Lakeside Medical Group.`,
      createdAt: claims[8].auditTrail.at(-1)!.timestamp,
      read: true,
    },
    {
      id: 'nt-5',
      claimNumber: claims[0].claimNumber,
      audience: ['ADJUSTER', 'ADMIN'],
      type: 'ASSIGNMENT',
      title: 'New claim registered',
      message: `${claims[0].claimNumber}: water damage claim awaiting assignment.`,
      createdAt: claims[0].createdAt,
      read: false,
    },
  ];

  return { customers, policies, claims, notifications, config: structuredClone(DEFAULT_RULES_CONFIG), adjusters: ADJUSTERS };
}
