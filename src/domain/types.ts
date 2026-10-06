// Core domain model for ClaimEase. Kept framework-agnostic so it can be shared
// with a real backend (or generated from an OpenAPI schema) later.

export type Role = 'CLAIMANT' | 'PROVIDER' | 'ADJUSTER' | 'ADMIN';

export type PolicyType = 'AUTO' | 'HOME' | 'RENTERS' | 'HEALTH';
export type PolicyStatus = 'ACTIVE' | 'LAPSED' | 'CANCELLED';
export type ClaimType = 'AUTO' | 'PROPERTY' | 'HEALTH';

export type ClaimStatus =
  | 'REPORTED'
  | 'REGISTERED'
  | 'UNDER_REVIEW'
  | 'INFORMATION_REQUIRED'
  | 'INVESTIGATION'
  | 'ADJUDICATION'
  | 'APPROVED'
  | 'PARTIALLY_APPROVED'
  | 'DENIED'
  | 'APPEALED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CLOSED'
  | 'REOPENED';

export type DocumentCategory =
  | 'PHOTO'
  | 'VIDEO'
  | 'POLICE_REPORT'
  | 'REPAIR_ESTIMATE'
  | 'RECEIPT'
  | 'INVOICE'
  | 'MEDICAL_RECORD'
  | 'OTHER';

export interface Customer {
  id: string;
  name: string;
  contact: { email: string; phone: string; address: string };
}

export interface Coverage {
  name: string;
  limit: number;
}

export interface HealthBenefits {
  copay: number;
  /** Member share after deductible, e.g. 0.2 = 20% */
  coinsurance: number;
  outOfPocketMax: number;
  /** Amount of the annual deductible already satisfied this plan year */
  deductibleMet: number;
  /** Amount of out-of-pocket max already satisfied this plan year */
  outOfPocketMet: number;
}

export interface Member {
  memberId: string;
  name: string;
  dob: string;
  relationship: 'SUBSCRIBER' | 'SPOUSE' | 'DEPENDENT';
  eligible: boolean;
}

export interface Vehicle {
  year: number;
  make: string;
  model: string;
  vin: string;
}

export interface Policy {
  policyNumber: string;
  customerId: string;
  type: PolicyType;
  status: PolicyStatus;
  effectiveDate: string; // ISO date
  expiryDate: string; // ISO date
  premium: number;
  coverages: Coverage[];
  deductible: number;
  exclusions: string[];
  health?: HealthBenefits;
  members?: Member[];
  vehicles?: Vehicle[];
  propertyAddress?: string;
}

export interface ClaimDocument {
  id: string;
  category: DocumentCategory;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  /** Object URL / data URL for image previews (simulated storage). */
  previewUrl?: string;
  /** Links an upload to an information request item it satisfies. */
  satisfiesRequestItemId?: string;
}

export type CommunicationChannel = 'CALL' | 'EMAIL' | 'PORTAL';

export interface CommunicationLogEntry {
  id: string;
  date: string;
  contactPerson: string;
  channel: CommunicationChannel;
  summary: string;
  requestedItems?: string;
  response?: string;
  loggedBy: string;
  loggedByRole: Role;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: Role | 'SYSTEM';
  action: string;
  fromStatus?: ClaimStatus;
  toStatus?: ClaimStatus;
  details?: string;
}

export interface Note {
  id: string;
  author: string;
  role: Role;
  createdAt: string;
  text: string;
}

export type DelayReason =
  | 'MISSING_INFORMATION'
  | 'INCORRECT_INFORMATION'
  | 'MISSING_DOCUMENTS'
  | 'UNCLEAR_LIABILITY'
  | 'COVERAGE_UNCERTAINTY'
  | 'HIGH_VALUE_COMPLEXITY'
  | 'THIRD_PARTIES'
  | 'FRAUD_INVESTIGATION'
  | 'VALUE_DISAGREEMENT'
  | 'CATASTROPHE_VOLUME'
  | 'LEGAL_INVOLVEMENT';

export interface InfoRequestItem {
  id: string;
  label: string;
  category?: DocumentCategory;
  reason: DelayReason;
  fulfilled: boolean;
}

export interface InformationRequest {
  id: string;
  requestedAt: string;
  requestedBy: string;
  message: string;
  items: InfoRequestItem[];
  respondedAt?: string;
}

export type ExpertType = 'ENGINEER' | 'CONTRACTOR' | 'MEDICAL' | 'REPAIR_SHOP' | 'APPRAISER';

export interface ExpertInput {
  id: string;
  expertType: ExpertType;
  expertName: string;
  status: 'PENDING' | 'RECEIVED';
  requestedAt: string;
  receivedAt?: string;
  summary?: string;
  recommendedAmount?: number;
}

export type DecisionOutcome = 'APPROVED' | 'PARTIALLY_APPROVED' | 'DENIED';

export interface Decision {
  outcome: DecisionOutcome;
  calculatedAmount: number;
  approvedAmount: number;
  overrideReason?: string;
  denialReasonCode?: string;
  explanation: string;
  decidedBy: string;
  decidedAt: string;
}

export type PaymentMethod = 'ACH' | 'CHECK' | 'VIRTUAL_CARD' | 'EFT';

export interface Payment {
  method: PaymentMethod;
  amount: number;
  date: string;
  reference: string;
  issuedBy: string;
}

export interface Appeal {
  id: string;
  reason: string;
  filedAt: string;
  filedBy: string;
  documentIds: string[];
  previousOutcome: DecisionOutcome;
  previousAmount: number;
}

// ---------- Claim-type specific details ----------

export type AutoIncidentType = 'COLLISION' | 'HIT_AND_RUN' | 'THEFT' | 'VANDALISM' | 'WEATHER' | 'GLASS';
export type FaultAssessment = 'CLAIMANT' | 'OTHER_PARTY' | 'SHARED' | 'UNKNOWN';

export interface OtherParty {
  name: string;
  phone?: string;
  insurer?: string;
  policyNumber?: string;
  vehicle?: string;
  atFault: 'YES' | 'NO' | 'UNKNOWN';
}

export interface AutoDetails {
  kind: 'AUTO';
  incidentType: AutoIncidentType;
  vehicle: { year?: number; make: string; model: string; vin?: string; damage: string };
  drivable: boolean;
  injuries: boolean;
  otherParties: OtherParty[];
  policeReportNumber?: string;
}

export type PropertyDamageType =
  | 'FIRE'
  | 'WATER'
  | 'WIND'
  | 'HAIL'
  | 'THEFT'
  | 'VANDALISM'
  | 'FLOOD'
  | 'EARTHQUAKE'
  | 'MOLD';

export interface PropertyDetails {
  kind: 'PROPERTY';
  damageType: PropertyDamageType;
  propertyAddress: string;
  areasAffected: string;
  habitable: boolean;
  contractorName?: string;
  itemsStolenOrDamaged?: string;
}

export type HealthServiceType = 'URGENT' | 'PRE_SERVICE' | 'POST_SERVICE';

export interface HealthServiceLine {
  procedureCode: string;
  diagnosisCode: string;
  units: number;
  billedAmount: number;
}

export interface HealthDetails {
  kind: 'HEALTH';
  memberId: string;
  patientName: string;
  patientDob: string;
  provider: { name: string; npi: string; taxId: string; facility?: string };
  serviceType: HealthServiceType;
  placeOfService: string;
  lines: HealthServiceLine[];
}

export type ClaimDetails = AutoDetails | PropertyDetails | HealthDetails;

export interface Claim {
  id: string;
  claimNumber: string;
  policyNumber: string;
  claimType: ClaimType;
  initiatorRole: Role;
  claimantName: string;
  dateOfLoss: string; // date of loss or service date
  location: { city: string; state: string };
  incidentDescription: string;
  estimatedAmount: number;
  /** Field keys the filer marked as estimated/unsure. */
  estimatedFields: string[];
  details: ClaimDetails;
  documents: ClaimDocument[];
  status: ClaimStatus;
  assignedAdjuster?: string;
  notes: Note[];
  communicationLog: CommunicationLogEntry[];
  informationRequests: InformationRequest[];
  expertInputs: ExpertInput[];
  decision?: Decision;
  decisionHistory: Decision[];
  payment?: Payment;
  appeals: Appeal[];
  auditTrail: AuditEntry[];
  tags: string[]; // e.g. CATASTROPHE, LEGAL
  createdAt: string;
  updatedAt: string;
  /** When the current SLA window started (creation, appeal or reopen). */
  slaStartedAt?: string;
  slaDueDate: string;
  decidedAt?: string;
}

export type NotificationType = 'STATUS' | 'INFO_REQUEST' | 'DECISION' | 'PAYMENT' | 'APPEAL' | 'ASSIGNMENT';

export interface AppNotification {
  id: string;
  claimNumber: string;
  audience: Role[];
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface Actor {
  name: string;
  role: Role;
}

// ---------- Rules engine ----------

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface CheckResult {
  id:
    | 'POLICY_ACTIVE'
    | 'COVERAGE'
    | 'ELIGIBILITY'
    | 'REQUIRED_DOCS'
    | 'COST_SHARING'
    | 'PAYABLE'
    | 'MANUAL_REVIEW';
  label: string;
  status: CheckStatus;
  explanation: string;
}

export interface ReviewTrigger {
  code:
    | 'HIGH_VALUE'
    | 'MISSING_DATA'
    | 'ESTIMATED_DATA'
    | 'UNCLEAR_LIABILITY'
    | 'COVERAGE_UNCERTAINTY'
    | 'THIRD_PARTY_PENDING'
    | 'FRAUD_NEW_POLICY'
    | 'FRAUD_DUPLICATE'
    | 'FRAUD_FREQUENT'
    | 'CATASTROPHE'
    | 'INJURY'
    | 'LEGAL';
  label: string;
  explanation: string;
  weight: number; // contribution to uncertainty score
  delayReason: DelayReason;
}

export interface HealthLineResult {
  procedureCode: string;
  description: string;
  billed: number;
  allowed: number;
  covered: boolean;
  deductible: number;
  copay: number;
  coinsurance: number;
  planPaid: number;
  patientResponsibility: number;
  remarkCode?: string;
}

export interface PayableBreakdown {
  claimed: number;
  allowed: number;
  coverageLimit: number | null;
  deductibleApplied: number;
  copayApplied: number;
  coinsuranceApplied: number;
  limitReduction: number;
  outOfPocketCapApplied: number;
  /** Provider write-off: billed minus allowed (health only). */
  contractualAdjustment: number;
  payable: number;
  claimantResponsibility: number;
  lines?: HealthLineResult[];
  notes: string[];
}

export type Complexity = 'LOW' | 'MEDIUM' | 'HIGH';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface RulesResult {
  checks: CheckResult[];
  triggers: ReviewTrigger[];
  payable: PayableBreakdown;
  uncertaintyScore: number; // 0-100
  complexity: Complexity;
  priority: Priority;
  needsManualReview: boolean;
  fastTrackEligible: boolean;
}

export interface RulesConfig {
  highValueThreshold: Record<ClaimType, number>;
  fastTrackMaxAmount: Record<ClaimType, number>;
  newPolicyDays: number;
  frequentClaimsCount: number;
  frequentClaimsWindowDays: number;
  /** Internal SLA targets in days, by complexity (auto/property). */
  slaTargetsDays: Record<'AUTO' | 'PROPERTY', Record<Complexity, number>>;
  /** Example ERISA-style windows in hours for health claims. */
  healthSlaHours: Record<HealthServiceType, number>;
  atRiskThresholdPct: number; // remaining fraction of SLA window considered "at risk"
}
