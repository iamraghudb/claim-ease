// Public service surface. UI code imports only from here, so swapping the
// mock implementations for HTTP clients is a one-file change.
export { claimService } from './claimService';
export type { NewClaimInput, NewDocumentInput, DecisionInput, ClaimFilter } from './claimService';
export { policyService } from './policyService';
export type { PolicyLookupResult } from './policyService';
export { notificationService, configService, adminService } from './notificationService';
export { aiService, isScannable } from './aiService';
export { ServiceError } from './db';
export { PERSONAS, ADJUSTERS } from './seed';
