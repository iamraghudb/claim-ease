const CLAIM_RE = /^CLM-(\d{4})-(\d{6})$/;
const POLICY_RE = /^POL-\d{6}$/;

export function formatClaimNumber(year: number, sequence: number): string {
  return `CLM-${year}-${String(sequence).padStart(6, '0')}`;
}

export function isValidClaimNumber(value: string): boolean {
  return CLAIM_RE.test(value);
}

export function isValidPolicyNumber(value: string): boolean {
  return POLICY_RE.test(value.trim().toUpperCase());
}

export function normalizePolicyNumber(value: string): string {
  const v = value.trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d{6}$/.test(v)) return `POL-${v}`;
  if (/^POL\d{6}$/.test(v)) return `POL-${v.slice(3)}`;
  return v;
}

/** Next claim number for the given date's year, continuing the highest existing sequence. */
export function nextClaimNumber(existing: string[], date: Date = new Date()): string {
  const year = date.getFullYear();
  let max = 0;
  for (const n of existing) {
    const m = CLAIM_RE.exec(n);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }
  return formatClaimNumber(year, max + 1);
}
