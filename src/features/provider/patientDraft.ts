import { todayIso } from '../../components/format';
import { emptyDraft, type IntakeDraft } from '../intake/draft';
import type { RecentPatient } from './practice';

/** A new claim for a patient the practice has billed before: plan, member and name are already filled in. */
export function draftForPatient(p: RecentPatient): IntakeDraft {
  const d = emptyDraft('PROVIDER');
  return {
    ...d,
    policyNumber: p.policyNumber,
    dateOfLoss: todayIso(),
    health: { ...d.health, memberId: p.memberId, patientName: p.patientName, patientDob: p.patientDob },
  };
}
