export interface GlossaryEntry {
  term: string;
  short: string;
  long: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  policy: {
    term: 'Policy',
    short: 'Your contract with the insurer that lists what is covered, limits, deductibles and exclusions.',
    long: 'An insurance policy is the legal contract between you and your insurer. The declarations page summarizes who and what is insured, the coverage period, limits, deductibles and premium. The policy wording describes covered events and exclusions.',
  },
  premium: {
    term: 'Premium',
    short: 'The amount you pay (monthly or yearly) to keep your policy active.',
    long: 'The premium is the price of the policy. If premiums are not paid, the policy may lapse, and losses after the lapse date are generally not covered.',
  },
  claim: {
    term: 'Claim',
    short: 'A formal request asking the insurer to pay for a covered loss or service.',
    long: 'A claim is your request for payment under the policy. It includes what happened, when and where, the amount of loss, and supporting documents such as photos, estimates or medical bills.',
  },
  deductible: {
    term: 'Deductible',
    short: 'The part of a covered loss you pay before insurance pays.',
    long: 'The deductible is subtracted from a covered loss before the insurer pays. For example, with a $500 deductible and a $3,000 covered repair, the insurer pays $2,500. Health plans usually have an annual deductible that resets each plan year.',
  },
  adjuster: {
    term: 'Adjuster',
    short: 'The person who investigates and evaluates a claim. Can be a company, independent, or public adjuster.',
    long: 'A company (staff) adjuster is employed by the insurer. An independent adjuster is a contractor the insurer hires, often during catastrophes. A public adjuster is hired by the policyholder to represent them, usually for a percentage of the settlement.',
  },
  adjudication: {
    term: 'Adjudication',
    short: 'The step where the insurer decides coverage and how much to pay.',
    long: 'During adjudication the insurer applies the policy terms (coverage, exclusions, deductible, limits, copay and coinsurance) to the verified facts of the claim and decides to approve, partially approve, or deny it.',
  },
  fnol: {
    term: 'FNOL',
    short: 'First Notice of Loss: the first report of a claim to the insurer.',
    long: 'The First Notice of Loss is the initial report that a loss happened. The more complete and accurate the FNOL, the faster the claim can move, since fewer follow-up requests are needed.',
  },
  settlement: {
    term: 'Settlement',
    short: 'The final agreed amount the insurer pays to resolve a claim.',
    long: 'A settlement is the amount paid to resolve the claim. It may be paid in one or more payments and may be negotiated if you disagree with the valuation.',
  },
  denial: {
    term: 'Denial',
    short: 'A decision not to pay a claim, with a stated reason.',
    long: 'A denial means the insurer will not pay the claim, for example because the policy was not in force, the loss is excluded, or required information was never received. You should receive the reason in writing and can usually appeal.',
  },
  appeal: {
    term: 'Appeal',
    short: 'A request to have a decision reviewed again, usually with new information.',
    long: 'An appeal asks the insurer to reconsider a denial or partial approval. Include a clear explanation and any new evidence. Health plans governed by ERISA must offer a formal internal appeal process; external review may also be available.',
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
    long: 'Exclusions list what the policy will not pay for, such as flood or earthquake on many homeowners policies, or cosmetic procedures on health plans.',
  },
};
