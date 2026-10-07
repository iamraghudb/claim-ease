export interface GlossaryEntry {
  term: string;
  short: string;
  long: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  policy: {
    term: 'Policy',
    short: 'Your contract with the insurer that lists what is covered, limits, deductibles and exclusions.',
    long: 'An insurance policy is the contract between you and your insurer. Its first page summarizes who and what is insured, the dates it covers, the limits, the deductible and the premium. The rest describes what is covered and what is not.',
  },
  premium: {
    term: 'Premium',
    short: 'The amount you pay (monthly or yearly) to keep your policy active.',
    long: 'The premium is the price of the policy. If it is not paid, the policy can end, and anything that happens after that date is generally not covered.',
  },
  claim: {
    term: 'Claim',
    short: 'A request asking the insurer to pay for something your policy covers.',
    long: 'A claim is your request for payment under the policy. It includes what happened, when and where, how much it cost, and supporting documents such as photos, estimates or medical bills.',
  },
  deductible: {
    term: 'Deductible',
    short: 'The part of a covered cost you pay yourself before insurance pays.',
    long: 'The deductible is taken off a covered cost before the insurer pays. For example, with a $500 deductible and a $3,000 covered repair, the insurer pays $2,500. Health plans usually have an annual deductible that resets each plan year.',
  },
  adjuster: {
    term: 'Adjuster',
    short: 'The person reviewing your claim. They check what happened and what your policy covers.',
    long: 'An adjuster looks at the facts of your claim, your policy and your documents, then works out what can be paid. Most adjusters work for the insurer. Some are independent contractors the insurer brings in, often after big storms. You can also hire a public adjuster to speak for you, usually for a share of the payout.',
  },
  adjudication: {
    term: 'Adjudication',
    short: 'The step where the insurer decides what is covered and how much to pay.',
    long: 'During adjudication the insurer checks the claim against your policy (what is covered, what is excluded, your deductible and limits) and decides to approve it, approve part of it, or deny it. In ClaimEase this step shows as "Decision pending".',
  },
  fnol: {
    term: 'First notice of loss',
    short: 'Your first report to the insurer that something happened.',
    long: 'The first notice of loss is the report that starts a claim. The more complete it is, the faster the claim can move, because there are fewer follow-up questions. Insurers sometimes shorten it to FNOL.',
  },
  sla: {
    term: 'Target time',
    short: 'How long we aim to take to decide a claim. It is a goal, not a legal deadline.',
    long: 'A target time is the number of days or hours we aim to take for a step, such as making a decision. Targets differ by type of claim, by state and by policy. If we are running late, the claim is flagged so someone can help. Insurers call this an SLA, short for service level agreement.',
  },
  settlement: {
    term: 'Settlement',
    short: 'The final agreed amount the insurer pays to resolve a claim.',
    long: 'A settlement is the amount paid to resolve the claim. It may be paid in one or more payments, and you can discuss it if you disagree with how your loss was valued.',
  },
  denial: {
    term: 'Denial',
    short: 'A decision not to pay a claim, with a stated reason.',
    long: 'A denial means the insurer will not pay the claim, for example because the policy was not active at the time, the loss is not covered, or the information we asked for never arrived. You should be told the reason in writing, and you can usually appeal.',
  },
  appeal: {
    term: 'Appeal',
    short: 'A request to have a decision reviewed again, usually with new information.',
    long: 'An appeal asks the insurer to take another look at a denial or a partial approval. Explain what you think is wrong and add any new evidence. Health plans must offer a formal way to appeal, and an outside review may also be available.',
  },
  copay: {
    term: 'Copay',
    short: 'A fixed amount you pay for certain health services, like an office visit.',
    long: 'A copay is a flat fee (for example, $30 per office visit) that you pay at the time of service, regardless of the total cost.',
  },
  coinsurance: {
    term: 'Coinsurance',
    short: 'Your percentage share of health costs after the deductible.',
    long: 'Coinsurance is your share of allowed costs after you meet the deductible. With 20% coinsurance, the plan pays 80% and you pay 20%, up to the out-of-pocket maximum.',
  },
  outOfPocketMax: {
    term: 'Out-of-pocket maximum',
    short: 'The most you pay for covered health services in a plan year.',
    long: 'Once your deductibles, copays and coinsurance add up to the out-of-pocket maximum, the plan pays 100% of covered in-network services for the rest of the plan year.',
  },
  exclusion: {
    term: 'Exclusion',
    short: 'A situation or type of loss the policy specifically does not cover.',
    long: 'Exclusions list what the policy will not pay for, such as flood or earthquake on many home policies, or cosmetic procedures on health plans.',
  },
};
