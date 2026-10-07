import type { DraftContext } from '../../domain/aiTypes';
import { AUTO_INCIDENT_TYPES, DOCUMENT_CATEGORY_LABELS, PROPERTY_DAMAGE_TYPES } from '../../domain/catalog';
import type { ReadinessResult } from '../../domain/readiness';
import type { RulesResult } from '../../domain/types';
import { reviewNotes } from './aiApply';
import { draftAmount, type IntakeDraft } from './draft';

/**
 * What the pre-submission check is allowed to see.
 * Sent: the app's own checklist, amounts, codes, dates and the typed description.
 * Not sent: the claimant's name, date of birth, member ID, address, phone or e-mail, and no file contents.
 */
export function buildDraftContext(d: IntakeDraft, readiness: ReadinessResult, rules: RulesResult): DraftContext {
  const facts: DraftContext['facts'] = {
    dateOfLossOrService: d.dateOfLoss,
    location: [d.location.city, d.location.state].filter(Boolean).join(', '),
    amount: draftAmount(d),
    description: d.incidentDescription.trim().slice(0, 600),
    estimatedFields: d.estimatedFields.join(', ') || 'none',
  };

  if (d.claimType === 'AUTO') {
    const a = d.auto;
    Object.assign(facts, {
      incidentType: AUTO_INCIDENT_TYPES.find((t) => t.value === a.incidentType)?.label ?? a.incidentType,
      vehicleDrivable: a.drivable,
      injuriesReported: a.injuries,
      otherPartiesCount: a.otherParties.length,
      otherPartiesWithUnknownFault: a.otherParties.filter((p) => p.atFault === 'UNKNOWN').length,
      policeReportNumberGiven: !!a.policeReportNumber?.trim(),
      vehicle: [a.vehicle.year, a.vehicle.make, a.vehicle.model].filter(Boolean).join(' '),
      vehicleDamage: a.vehicle.damage,
    });
  } else if (d.claimType === 'PROPERTY') {
    const p = d.property;
    Object.assign(facts, {
      damageType: PROPERTY_DAMAGE_TYPES.find((t) => t.value === p.damageType)?.label ?? p.damageType,
      homeLivable: p.habitable,
      areasAffected: p.areasAffected,
      contractorGiven: !!p.contractorName?.trim(),
      itemsListed: !!p.itemsStolenOrDamaged?.trim(),
      namedStormOrDisaster: d.catastrophe,
    });
  } else {
    const h = d.health;
    Object.assign(facts, {
      serviceType: h.serviceType,
      placeOfService: h.placeOfService,
      serviceLines: h.lines.map((l) => `${l.procedureCode || '?'} / ${l.diagnosisCode || '?'} x${l.units} $${l.billedAmount}`).join('; '),
      providerNpiValid: /^\d{10}$/.test(h.provider.npi),
      patientSelectedFromPlan: !!h.memberId,
    });
  }

  const scan = d.scan;
  return {
    claimType: d.claimType,
    readinessScore: readiness.score,
    checklist: readiness.items.map((i) => ({ label: i.label, required: i.required, satisfied: i.satisfied, estimated: !!i.estimated })),
    facts,
    documents: d.documents.map((doc) => ({
      category: DOCUMENT_CATEGORY_LABELS[doc.category],
      fileName: doc.fileName,
      aiSummary: scan?.documents.find((s) => s.fileName === doc.fileName)?.summary || undefined,
    })),
    reviewTriggers: rules.triggers.map((t) => t.label),
    // Demo-mode scan warnings are boilerplate, so only real ones are passed on.
    scanWarnings: scan && scan.source === 'ai' ? [...scan.warnings, ...reviewNotes(d, scan)] : [],
  };
}
