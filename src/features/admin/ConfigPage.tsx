import { useEffect, useState } from 'react';
import { RotateCcw, Save, Settings } from 'lucide-react';
import { DEFAULT_RULES_CONFIG } from '../../domain/config';
import { SLA_DISCLAIMER } from '../../domain/sla';
import type { ClaimType, Complexity, HealthServiceType, RulesConfig } from '../../domain/types';
import { configService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/toastStore';
import { Alert, Button, Card, PageHeader } from '../../components/ui';

const TYPES: ClaimType[] = ['AUTO', 'PROPERTY', 'HEALTH'];
const COMPLEXITIES: Complexity[] = ['LOW', 'MEDIUM', 'HIGH'];
const HEALTH: HealthServiceType[] = ['URGENT', 'PRE_SERVICE', 'POST_SERVICE'];

function Num({ id, label, value, onChange, suffix, min = 0, step = 1 }: { id: string; label: string; value: number; onChange: (n: number) => void; suffix?: string; min?: number; step?: number }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" min={min} step={step} className="input" value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
        {suffix && <span className="shrink-0 text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { config, setConfig, role } = useAppStore();
  const [draft, setDraft] = useState<RulesConfig>(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(config), [config]);
  if (role !== 'ADMIN') return <Alert tone="info" title="Admins only">Switch to the Admin role to edit rules engine thresholds and SLA targets.</Alert>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  async function save() {
    setSaving(true);
    const saved = await configService.update(draft);
    setConfig(saved);
    setSaving(false);
    toast.success('Configuration saved', 'Rules engine and SLA targets updated. Queue priorities recalculated.');
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Rules engine & SLA configuration"
        subtitle="Changes apply immediately to rules evaluation, fast-track eligibility and new SLA windows."
        actions={
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={() => setDraft(structuredClone(DEFAULT_RULES_CONFIG))}>
              Defaults
            </Button>
            <Button icon={Save} onClick={save} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="space-y-6">
        <Card title="Manual review thresholds" icon={Settings}>
          <div className="grid gap-4 sm:grid-cols-3">
            {TYPES.map((t) => (
              <Num key={t} id={`hv-${t}`} label={`High value: ${t.toLowerCase()}`} suffix="USD" step={500} value={draft.highValueThreshold[t]} onChange={(n) => setDraft({ ...draft, highValueThreshold: { ...draft.highValueThreshold, [t]: n } })} />
            ))}
            {TYPES.map((t) => (
              <Num key={t} id={`ft-${t}`} label={`Fast-track max: ${t.toLowerCase()}`} suffix="USD" step={250} value={draft.fastTrackMaxAmount[t]} onChange={(n) => setDraft({ ...draft, fastTrackMaxAmount: { ...draft.fastTrackMaxAmount, [t]: n } })} />
            ))}
          </div>
        </Card>
        <Card title="Fraud indicators">
          <div className="grid gap-4 sm:grid-cols-3">
            <Num id="np" label="Loss within N days of policy start" suffix="days" value={draft.newPolicyDays} onChange={(n) => setDraft({ ...draft, newPolicyDays: n })} />
            <Num id="fc" label="Frequent claims: other claims ≥" suffix="claims" min={1} value={draft.frequentClaimsCount} onChange={(n) => setDraft({ ...draft, frequentClaimsCount: n })} />
            <Num id="fw" label="…within window" suffix="days" min={1} value={draft.frequentClaimsWindowDays} onChange={(n) => setDraft({ ...draft, frequentClaimsWindowDays: n })} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Duplicate claims (same policy, same date of loss) are always flagged.</p>
        </Card>
        <Card title="Internal SLA targets (auto & property)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Line</th>
                  {COMPLEXITIES.map((c) => (
                    <th key={c} className="pb-2 font-medium">{c.toLowerCase()} complexity (days)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['AUTO', 'PROPERTY'] as const).map((t) => (
                  <tr key={t}>
                    <th scope="row" className="py-1.5 pr-3 text-left font-medium">{t.charAt(0) + t.slice(1).toLowerCase()}</th>
                    {COMPLEXITIES.map((c) => (
                      <td key={c} className="py-1.5 pr-3">
                        <label className="sr-only" htmlFor={`sla-${t}-${c}`}>{`${t} ${c} days`}</label>
                        <input
                          id={`sla-${t}-${c}`}
                          type="number"
                          min={1}
                          className="input"
                          value={draft.slaTargetsDays[t][c]}
                          onChange={(e) => setDraft({ ...draft, slaTargetsDays: { ...draft.slaTargetsDays, [t]: { ...draft.slaTargetsDays[t], [c]: Math.max(1, Number(e.target.value) || 1) } } })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Health decision windows (example ERISA timeframes)">
          <div className="grid gap-4 sm:grid-cols-3">
            {HEALTH.map((h) => (
              <Num key={h} id={`h-${h}`} label={h.replace('_', '-').toLowerCase()} suffix="hours" min={1} value={draft.healthSlaHours[h]} onChange={(n) => setDraft({ ...draft, healthSlaHours: { ...draft.healthSlaHours, [h]: n } })} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Defaults: urgent 72 h, pre-service 15 days (360 h), post-service 30 days (720 h).</p>
        </Card>
        <Card title="At-risk threshold">
          <Num id="risk" label="Flag “at risk” when remaining SLA window is below" suffix="% of window" min={1} value={Math.round(draft.atRiskThresholdPct * 100)} onChange={(n) => setDraft({ ...draft, atRiskThresholdPct: Math.min(100, n) / 100 })} />
        </Card>
        <Alert tone="warn" title="Illustrative only">{SLA_DISCLAIMER}</Alert>
      </div>
    </div>
  );
}
