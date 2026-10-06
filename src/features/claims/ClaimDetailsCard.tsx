import { FileText } from 'lucide-react';
import { AUTO_INCIDENT_TYPES, DIAGNOSES, findProcedure, HEALTH_SERVICE_TYPES, PLACES_OF_SERVICE, PROPERTY_DAMAGE_TYPES } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import type { Claim } from '../../domain/types';
import { formatDate } from '../../components/format';
import { Card, DescriptionList, Pill } from '../../components/ui';

export function ClaimDetailsCard({ claim }: { claim: Claim }) {
  const est = (k: string) => (claim.estimatedFields.includes(k) ? <Pill tone="amber">estimated</Pill> : null);
  const d = claim.details;
  const common = [
    { label: claim.claimType === 'HEALTH' ? 'Date of service' : 'Date of loss', value: <span className="inline-flex items-center gap-2">{formatDate(claim.dateOfLoss)} {est('dateOfLoss')}</span> },
    { label: 'Location', value: `${claim.location.city}, ${claim.location.state}` },
    {
      label: claim.claimType === 'HEALTH' ? 'Billed amount' : 'Estimated amount',
      value: <span className="inline-flex items-center gap-2">{formatUSD(claim.estimatedAmount)} {est('estimatedAmount')}</span>,
    },
    { label: 'Filed by', value: `${claim.initiatorRole === 'PROVIDER' ? 'Provider' : 'Claimant'} · ${formatDate(claim.createdAt)}` },
  ];

  let specific: { label: string; value: React.ReactNode }[] = [];
  if (d.kind === 'AUTO')
    specific = [
      { label: 'Incident', value: AUTO_INCIDENT_TYPES.find((t) => t.value === d.incidentType)?.label },
      { label: 'Vehicle', value: `${d.vehicle.year ?? ''} ${d.vehicle.make} ${d.vehicle.model}${d.vehicle.vin ? ` · VIN ${d.vehicle.vin}` : ''}` },
      { label: 'Damage', value: <span className="inline-flex flex-wrap items-center gap-2">{d.vehicle.damage} {est('vehicleDamage')}</span> },
      { label: 'Drivable / injuries', value: `${d.drivable ? 'Drivable' : 'Not drivable'} · ${d.injuries ? 'Injuries reported' : 'No injuries'}` },
      { label: 'Police report #', value: d.policeReportNumber || '—' },
      {
        label: 'Other parties',
        value: d.otherParties.length
          ? d.otherParties.map((p, i) => (
              <span key={i} className="block">
                {p.name}
                {p.insurer ? ` (${p.insurer}${p.policyNumber ? ` ${p.policyNumber}` : ''})` : ''} · at fault:{' '}
                <strong className={p.atFault === 'UNKNOWN' ? 'text-amber-700' : ''}>{p.atFault.toLowerCase()}</strong>
              </span>
            ))
          : 'None',
      },
    ];
  else if (d.kind === 'PROPERTY')
    specific = [
      { label: 'Damage type', value: PROPERTY_DAMAGE_TYPES.find((t) => t.value === d.damageType)?.label },
      { label: 'Property', value: d.propertyAddress },
      { label: 'Areas affected', value: <span className="inline-flex items-center gap-2">{d.areasAffected} {est('areasAffected')}</span> },
      { label: 'Livable', value: d.habitable ? 'Yes' : <strong className="text-red-700">No — displaced</strong> },
      ...(d.itemsStolenOrDamaged ? [{ label: 'Items', value: d.itemsStolenOrDamaged }] : []),
      ...(d.contractorName ? [{ label: 'Contractor', value: d.contractorName }] : []),
    ];
  else
    specific = [
      { label: 'Patient', value: `${d.patientName} · DOB ${formatDate(d.patientDob)}` },
      { label: 'Member ID', value: <span className="font-mono">{d.memberId}</span> },
      { label: 'Provider', value: `${d.provider.name} · NPI ${d.provider.npi}` },
      { label: 'Claim category', value: HEALTH_SERVICE_TYPES.find((t) => t.value === d.serviceType)?.label },
      { label: 'Place of service', value: PLACES_OF_SERVICE.find((p) => p.value === d.placeOfService)?.label },
    ];

  return (
    <Card title="Claim details" icon={FileText}>
      <DescriptionList items={[...common, ...specific]} />
      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{claim.claimType === 'HEALTH' ? 'Clinical summary' : 'What happened'}</p>
        <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{claim.incidentDescription}</p>
      </div>
      {d.kind === 'HEALTH' && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Service lines</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Procedure</th>
                <th className="py-2 pr-3 font-medium">Diagnosis</th>
                <th className="py-2 pr-3 text-right font-medium">Units</th>
                <th className="py-2 text-right font-medium">Billed</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-3">
                    <span className="font-mono">{l.procedureCode}</span> <span className="text-slate-600">{findProcedure(l.procedureCode)?.description}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="font-mono">{l.diagnosisCode}</span> <span className="text-slate-600">{DIAGNOSES.find((x) => x.code === l.diagnosisCode)?.description}</span>
                  </td>
                  <td className="py-2 pr-3 text-right">{l.units}</td>
                  <td className="py-2 text-right">{formatUSD(l.billedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {claim.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {claim.tags.map((t) => (
            <Pill key={t} tone={t === 'CATASTROPHE' ? 'red' : 'purple'}>
              {t === 'CATASTROPHE' ? 'Catastrophe event' : t}
            </Pill>
          ))}
        </div>
      )}
    </Card>
  );
}
