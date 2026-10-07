import type {
  AutoIncidentType,
  ClaimType,
  DelayReason,
  DocumentCategory,
  ExpertType,
  HealthServiceType,
  PolicyType,
  PropertyDamageType,
} from './types';

// Reference data. In production these would come from a product/benefits
// configuration service; they are simplified illustrations here.

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  AUTO: 'Auto',
  PROPERTY: 'Property',
  HEALTH: 'Health',
};

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  AUTO: 'Auto insurance',
  HOME: 'Home insurance',
  RENTERS: 'Renters insurance',
  HEALTH: 'Health insurance',
};

export const POLICY_TO_CLAIM_TYPE: Record<PolicyType, ClaimType> = {
  AUTO: 'AUTO',
  HOME: 'PROPERTY',
  RENTERS: 'PROPERTY',
  HEALTH: 'HEALTH',
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  PHOTO: 'Photo',
  VIDEO: 'Video',
  POLICE_REPORT: 'Police report',
  REPAIR_ESTIMATE: 'Repair estimate',
  RECEIPT: 'Receipt',
  INVOICE: 'Itemized bill',
  MEDICAL_RECORD: 'Medical record',
  OTHER: 'Other',
};

export const AUTO_INCIDENT_TYPES: { value: AutoIncidentType; label: string; coverage: string }[] = [
  { value: 'COLLISION', label: 'Collision with another vehicle or object', coverage: 'Collision' },
  { value: 'HIT_AND_RUN', label: 'Hit and run', coverage: 'Uninsured Motorist' },
  { value: 'THEFT', label: 'Theft or break-in', coverage: 'Comprehensive' },
  { value: 'VANDALISM', label: 'Vandalism', coverage: 'Comprehensive' },
  { value: 'WEATHER', label: 'Weather (hail, falling tree, flood)', coverage: 'Comprehensive' },
  { value: 'GLASS', label: 'Glass / windshield only', coverage: 'Comprehensive' },
];

export const PROPERTY_DAMAGE_TYPES: { value: PropertyDamageType; label: string }[] = [
  { value: 'FIRE', label: 'Fire or smoke' },
  { value: 'WATER', label: 'Sudden water damage (burst pipe, appliance leak)' },
  { value: 'WIND', label: 'Wind or storm' },
  { value: 'HAIL', label: 'Hail' },
  { value: 'THEFT', label: 'Theft or burglary' },
  { value: 'VANDALISM', label: 'Vandalism' },
  { value: 'FLOOD', label: 'Flood (rising surface water)' },
  { value: 'EARTHQUAKE', label: 'Earthquake' },
  { value: 'MOLD', label: 'Mold' },
];

/** Which named coverage on the policy responds to a property loss. */
export function propertyCoverageFor(damage: PropertyDamageType, policyType: PolicyType): string {
  if (policyType === 'RENTERS') return 'Personal Property';
  return damage === 'THEFT' ? 'Personal Property' : 'Dwelling';
}

export interface ProcedureCode {
  code: string;
  description: string;
  category: 'OFFICE_VISIT' | 'URGENT_CARE' | 'IMAGING' | 'LAB' | 'SURGERY' | 'THERAPY' | 'COSMETIC' | 'DENTAL' | 'VISION';
  /** Simplified in-network fee schedule (allowed amount per unit). */
  allowed: number;
  requiresMedicalRecord?: boolean;
}

export const PROCEDURES: ProcedureCode[] = [
  { code: '99213', description: 'Office visit, established patient (low complexity)', category: 'OFFICE_VISIT', allowed: 110 },
  { code: '99214', description: 'Office visit, established patient (moderate)', category: 'OFFICE_VISIT', allowed: 165 },
  { code: 'S9083', description: 'Urgent care center visit', category: 'URGENT_CARE', allowed: 180 },
  { code: '73721', description: 'MRI lower extremity joint, without contrast', category: 'IMAGING', allowed: 850, requiresMedicalRecord: true },
  { code: '71046', description: 'Chest X-ray, 2 views', category: 'IMAGING', allowed: 95 },
  { code: '80053', description: 'Comprehensive metabolic panel', category: 'LAB', allowed: 38 },
  { code: '85025', description: 'Complete blood count (CBC)', category: 'LAB', allowed: 22 },
  { code: '29881', description: 'Knee arthroscopy with meniscectomy', category: 'SURGERY', allowed: 4200, requiresMedicalRecord: true },
  { code: '97110', description: 'Physical therapy, therapeutic exercise (15 min)', category: 'THERAPY', allowed: 42 },
  { code: '15780', description: 'Dermabrasion (cosmetic)', category: 'COSMETIC', allowed: 0 },
  // Dental (CDT codes). Simplified in-network fees.
  { code: 'D0120', description: 'Dental: periodic oral evaluation', category: 'DENTAL', allowed: 48 },
  { code: 'D0274', description: 'Dental: bitewing X-rays, four films', category: 'DENTAL', allowed: 62 },
  { code: 'D1110', description: 'Dental: adult cleaning (prophylaxis)', category: 'DENTAL', allowed: 95 },
  { code: 'D2391', description: 'Dental: resin filling, one surface, back tooth', category: 'DENTAL', allowed: 175 },
  { code: 'D2740', description: 'Dental: porcelain crown', category: 'DENTAL', allowed: 1050 },
  { code: 'D3330', description: 'Dental: root canal, molar', category: 'DENTAL', allowed: 980, requiresMedicalRecord: true },
  // Vision. Simplified in-network fees.
  { code: '92014', description: 'Vision: comprehensive eye exam, established patient', category: 'VISION', allowed: 135 },
  { code: '92015', description: 'Vision: refraction (glasses prescription)', category: 'VISION', allowed: 45 },
  { code: 'V2020', description: 'Vision: eyeglass frames', category: 'VISION', allowed: 150 },
  { code: 'V2100', description: 'Vision: single-vision lens, pair', category: 'VISION', allowed: 120 },
];

export const DIAGNOSES: { code: string; description: string }[] = [
  { code: 'S83.241A', description: 'Tear of medial meniscus, right knee' },
  { code: 'M25.561', description: 'Pain in right knee' },
  { code: 'J06.9', description: 'Acute upper respiratory infection' },
  { code: 'R07.9', description: 'Chest pain, unspecified' },
  { code: 'E11.9', description: 'Type 2 diabetes without complications' },
  { code: 'Z00.00', description: 'General adult exam' },
  { code: 'L90.5', description: 'Scar conditions of skin' },
  { code: 'Z01.20', description: 'Dental exam and cleaning, routine' },
  { code: 'K02.9', description: 'Dental caries (cavity), unspecified' },
  { code: 'K04.01', description: 'Reversible pulpitis (painful tooth nerve)' },
  { code: 'Z01.00', description: 'Eye exam, routine' },
  { code: 'H52.13', description: 'Myopia (nearsightedness), both eyes' },
];

export const PROCEDURE_CATEGORY_TO_COVERAGE: Record<ProcedureCode['category'], string> = {
  OFFICE_VISIT: 'Office Visits',
  URGENT_CARE: 'Urgent Care',
  IMAGING: 'Diagnostic Imaging',
  LAB: 'Laboratory',
  SURGERY: 'Outpatient Surgery',
  THERAPY: 'Rehabilitation',
  COSMETIC: 'Cosmetic',
  DENTAL: 'Dental',
  VISION: 'Vision',
};

export function findProcedure(code: string): ProcedureCode | undefined {
  return PROCEDURES.find((p) => p.code === code);
}

export const HEALTH_SERVICE_TYPES: { value: HealthServiceType; label: string; hint: string }[] = [
  { value: 'URGENT', label: 'Urgent care', hint: 'Target decision time: 72 hours' },
  { value: 'PRE_SERVICE', label: 'Before treatment (prior approval)', hint: 'Target decision time: 15 days' },
  { value: 'POST_SERVICE', label: 'After treatment', hint: 'Target decision time: 30 days' },
];

export const PLACES_OF_SERVICE = [
  { value: '11', label: '11 – Office' },
  { value: '20', label: '20 – Urgent care facility' },
  { value: '22', label: '22 – Outpatient hospital' },
  { value: '23', label: '23 – Emergency room' },
  { value: '24', label: '24 – Ambulatory surgical center' },
];

export const DENIAL_REASON_CODES: { code: string; label: string }[] = [
  { code: 'D01', label: 'Policy not in force on date of loss' },
  { code: 'D02', label: 'Loss excluded under policy terms' },
  { code: 'D03', label: 'Service not covered / not medically necessary' },
  { code: 'D04', label: 'Member or claimant not eligible' },
  { code: 'D05', label: 'Insufficient documentation after request' },
  { code: 'D06', label: 'Duplicate claim' },
  { code: 'D07', label: 'Material misrepresentation' },
  { code: 'D08', label: 'Damage pre-existing / wear and tear' },
];

export const EXPERT_TYPES: { value: ExpertType; label: string }[] = [
  { value: 'ENGINEER', label: 'Structural engineer' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'MEDICAL', label: 'Medical reviewer' },
  { value: 'REPAIR_SHOP', label: 'Repair shop' },
  { value: 'APPRAISER', label: 'Independent appraiser' },
];

export const DELAY_REASON_LABELS: Record<DelayReason, string> = {
  MISSING_INFORMATION: 'Missing information',
  INCORRECT_INFORMATION: 'Incorrect information',
  MISSING_DOCUMENTS: 'Missing documents',
  UNCLEAR_LIABILITY: 'Unclear who is at fault',
  COVERAGE_UNCERTAINTY: 'Unsure what is covered',
  HIGH_VALUE_COMPLEXITY: 'Large or complex claim',
  THIRD_PARTIES: 'Waiting on other parties',
  FRAUD_INVESTIGATION: 'Fraud investigation',
  VALUE_DISAGREEMENT: 'Disagreement on the amount',
  CATASTROPHE_VOLUME: 'Storm or disaster volume',
  LEGAL_INVOLVEMENT: 'Legal involvement',
};

/** Common items an adjuster can request, by claim type. */
export const INFO_REQUEST_TEMPLATES: Record<
  ClaimType,
  { label: string; category?: DocumentCategory; reason: DelayReason }[]
> = {
  AUTO: [
    { label: 'Police report', category: 'POLICE_REPORT', reason: 'MISSING_DOCUMENTS' },
    { label: 'Repair shop estimate', category: 'REPAIR_ESTIMATE', reason: 'MISSING_DOCUMENTS' },
    { label: 'Photos of all damaged areas', category: 'PHOTO', reason: 'MISSING_DOCUMENTS' },
    { label: "Other driver's insurance details", reason: 'MISSING_INFORMATION' },
    { label: 'Corrected date / time of accident', reason: 'INCORRECT_INFORMATION' },
    { label: 'Witness contact information', reason: 'UNCLEAR_LIABILITY' },
  ],
  PROPERTY: [
    { label: 'Contractor estimate', category: 'REPAIR_ESTIMATE', reason: 'MISSING_DOCUMENTS' },
    { label: 'Photos / video of damage', category: 'PHOTO', reason: 'MISSING_DOCUMENTS' },
    { label: 'Receipts for damaged items', category: 'RECEIPT', reason: 'MISSING_DOCUMENTS' },
    { label: 'Police report (theft/vandalism)', category: 'POLICE_REPORT', reason: 'MISSING_DOCUMENTS' },
    { label: 'Invoice for emergency repairs (water removal, tarp)', category: 'INVOICE', reason: 'MISSING_DOCUMENTS' },
    { label: 'Corrected damage description', reason: 'INCORRECT_INFORMATION' },
  ],
  HEALTH: [
    { label: 'Medical records / clinical notes', category: 'MEDICAL_RECORD', reason: 'MISSING_DOCUMENTS' },
    { label: 'Itemized bill', category: 'INVOICE', reason: 'MISSING_DOCUMENTS' },
    { label: 'Corrected procedure or diagnosis code', reason: 'INCORRECT_INFORMATION' },
    { label: 'Referral or prior-approval number', reason: 'MISSING_INFORMATION' },
    { label: 'Details of any other insurance', reason: 'THIRD_PARTIES' },
  ],
};

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];
