import { isValidPolicyNumber, normalizePolicyNumber } from '../domain/claimNumber';
import { checkPolicyActive } from '../domain/rulesEngine';
import type { Customer, Policy } from '../domain/types';
import { delay, getDb, ServiceError } from './db';

export interface PolicyLookupResult {
  policy: Policy;
  customer: Customer;
}

export const policyService = {
  async list(): Promise<Policy[]> {
    return delay(getDb().policies);
  },

  async get(policyNumber: string): Promise<Policy> {
    const p = getDb().policies.find((x) => x.policyNumber === policyNumber);
    if (!p) throw new ServiceError(`Policy ${policyNumber} not found`, 'NOT_FOUND');
    return delay(p);
  },

  /**
   * FNOL policy lookup: policy must exist, be ACTIVE, and (when given) the
   * date of loss must fall inside the coverage period.
   */
  async lookup(rawPolicyNumber: string, dateOfLoss?: string): Promise<PolicyLookupResult> {
    const policyNumber = normalizePolicyNumber(rawPolicyNumber);
    await delay(null, 400);
    if (!isValidPolicyNumber(policyNumber))
      throw new ServiceError('Policy numbers look like POL-123456 (POL- followed by 6 digits).');
    const db = getDb();
    const policy = db.policies.find((p) => p.policyNumber === policyNumber);
    if (!policy) throw new ServiceError(`We couldn't find policy ${policyNumber}. Check your ID card or declarations page.`, 'NOT_FOUND');
    if (policy.status !== 'ACTIVE')
      throw new ServiceError(`Policy ${policyNumber} is ${policy.status.toLowerCase()}. Contact your agent to discuss options.`);
    if (dateOfLoss) {
      const check = checkPolicyActive(policy, dateOfLoss);
      if (check.status === 'FAIL') throw new ServiceError(check.explanation);
    }
    const customer = db.customers.find((c) => c.id === policy.customerId)!;
    return structuredClone({ policy, customer });
  },

  async customers(): Promise<Customer[]> {
    return delay(getDb().customers);
  },
};
