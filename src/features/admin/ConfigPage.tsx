import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgeDollarSign, Check, Clock, Info, RotateCcw, Save, ShieldAlert, Zap, type LucideIcon } from 'lucide-react';
import { DEFAULT_RULES_CONFIG } from '../../domain/config';
import { formatUSD } from '../../domain/rulesEngine';
import type { ClaimType, Complexity, HealthServiceType, RulesConfig } from '../../domain/types';
import { configService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { toast } from '../../store/toastStore';
import { Alert, Button, Card, cx, Field, PageHeader } from '../../components/ui';
import { SlaInfo } from '../../components/badges';
import { useCopilotPage } from '../copilot/pages';
import { configPage } from './aiLogic';

const TYPES: { value: ClaimType; label: string }[] = [
  { value: 'AUTO', label: 'Auto' },
  { value: 'PROPERTY', label: 'Property' },
  { value: 'HEALTH', label: 'Health' },
];
const COMPLEXITIES: { value: Complexity; label: string }[] = [
  { value: 'LOW', label: 'Low complexity' },
  { value: 'MEDIUM', label: 'Medium complexity' },
  { value: 'HIGH', label: 'High complexity' },
];
const HEALTH: { value: HealthServiceType; label: string }[] = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'PRE_SERVICE', label: 'Pre-service' },
  { value: 'POST_SERVICE', label: 'Post-service' },
];

const D = DEFAULT_RULES_CONFIG;
const days = (hours: number) => `${Number.isInteger(hours / 24) ? hours / 24 : (hours / 24).toFixed(1)} days`;

/** A labelled number input with an optional prefix ("$") and suffix ("days") shown as attached add-ons. */
function NumberField({ id, label, hint, value, onChange, prefix, suffix, min = 0, step = 1 }: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
}) {
  const addon = 'inline-flex shrink-0 items-center border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-500';
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex">
        {prefix && <span className={cx(addon, 'rounded-l-xl border-r-0')}>{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          className={cx('input relative min-w-0 flex-1 tabular-nums focus:z-10', prefix && 'rounded-l-none', suffix && 'rounded-r-none')}
          value={value}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        />
        {suffix && <span className={cx(addon, 'rounded-r-xl border-l-0 text-xs')}>{suffix}</span>}
      </div>
    </Field>
  );
}

function SettingsCard({ title, icon, intro, children, className }: { title: ReactNode; icon: LucideIcon; intro?: string; children: ReactNode; className?: string }) {
  return (
    <Card title={title} icon={icon} className={className}>
      {intro && <p className="-mt-1 mb-4 text-sm text-slate-600">{intro}</p>}
      {children}
    </Card>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <legend className="float-left mb-3 w-full">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </legend>
      <div className="clear-both grid gap-4 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

export default function ConfigPage() {
  const { config, setConfig, role, loaded } = useAppStore();
  const [draft, setDraft] = useState<RulesConfig>(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  // Ease can see the live settings (not half-typed edits) and whether there are unsaved changes.
  useCopilotPage(loaded && role === 'ADMIN' ? configPage(config, dirty) : null);
  if (role !== 'ADMIN') return <Alert tone="info" title="Admins only">Switch to the Admin role to edit rules thresholds and SLA targets.</Alert>;

  const isDefault = JSON.stringify(draft) === JSON.stringify(D);
  async function save() {
    setSaving(true);
    const saved = await configService.update(draft);
    setConfig(saved);
    setSaving(false);
    toast.success('Configuration saved', 'Rules and SLA targets updated. Queue priorities recalculated.');
  }

  return (
    <div>
      <PageHeader
        back={
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
          </Link>
        }
        title="Rules & SLA configuration"
        subtitle="Changes apply straight away to rules checks, fast-track eligibility and new target times."
      />

      <div className="space-y-6" data-tour="rules-config">
        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsCard title="High-value thresholds" icon={BadgeDollarSign} intro="Claims above these amounts are sent to an adjuster for manual review.">
            <div className="grid gap-4 sm:grid-cols-3">
              {TYPES.map((t) => (
                <NumberField
                  key={t.value}
                  id={`hv-${t.value}`}
                  label={t.label}
                  prefix="$"
                  step={500}
                  hint={`Default ${formatUSD(D.highValueThreshold[t.value])}`}
                  value={draft.highValueThreshold[t.value]}
                  onChange={(n) => setDraft({ ...draft, highValueThreshold: { ...draft.highValueThreshold, [t.value]: n } })}
                />
              ))}
            </div>
          </SettingsCard>

          <SettingsCard title="Fast-track limits" icon={Zap} intro="Claims at or below these amounts can skip investigation when uncertainty is low.">
            <div className="grid gap-4 sm:grid-cols-3">
              {TYPES.map((t) => (
                <NumberField
                  key={t.value}
                  id={`ft-${t.value}`}
                  label={t.label}
                  prefix="$"
                  step={250}
                  hint={`Default ${formatUSD(D.fastTrackMaxAmount[t.value])}`}
                  value={draft.fastTrackMaxAmount[t.value]}
                  onChange={(n) => setDraft({ ...draft, fastTrackMaxAmount: { ...draft.fastTrackMaxAmount, [t.value]: n } })}
                />
              ))}
            </div>
          </SettingsCard>
        </div>

        <SettingsCard title="Fraud checks" icon={ShieldAlert} intro="Claims that match these patterns are flagged for a closer look.">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="np"
              label="Loss soon after policy start"
              suffix="days"
              hint={`Flag losses within this many days of the start date. Default ${D.newPolicyDays}`}
              value={draft.newPolicyDays}
              onChange={(n) => setDraft({ ...draft, newPolicyDays: n })}
            />
            <NumberField
              id="fc"
              label="Frequent claims: at least"
              suffix="claims"
              min={1}
              hint={`Other claims on the same policy. Default ${D.frequentClaimsCount}`}
              value={draft.frequentClaimsCount}
              onChange={(n) => setDraft({ ...draft, frequentClaimsCount: n })}
            />
            <NumberField
              id="fw"
              label="Frequent claims: within"
              suffix="days"
              min={1}
              hint={`Look-back window. Default ${D.frequentClaimsWindowDays}`}
              value={draft.frequentClaimsWindowDays}
              onChange={(n) => setDraft({ ...draft, frequentClaimsWindowDays: n })}
            />
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> Duplicate claims (same policy, same date) are always flagged.
          </p>
        </SettingsCard>

        <SettingsCard
          title={
            <>
              SLA targets
              <SlaInfo />
            </>
          }
          icon={Clock}
          intro="How long each kind of claim should take to reach a decision."
        >
          <div className="space-y-5">
            {(['AUTO', 'PROPERTY'] as const).map((t) => (
              <Group key={t} title={t === 'AUTO' ? 'Auto claims' : 'Property claims'} note="Days to a decision">
                {COMPLEXITIES.map((c) => (
                  <NumberField
                    key={c.value}
                    id={`sla-${t}-${c.value}`}
                    label={c.label}
                    suffix="days"
                    min={1}
                    hint={`Default ${D.slaTargetsDays[t][c.value]} days`}
                    value={draft.slaTargetsDays[t][c.value]}
                    onChange={(n) => setDraft({ ...draft, slaTargetsDays: { ...draft.slaTargetsDays, [t]: { ...draft.slaTargetsDays[t], [c.value]: Math.max(1, n) } } })}
                  />
                ))}
              </Group>
            ))}

            <Group title="Health claims" note="Hours to a decision, by type of service">
              {HEALTH.map((h) => (
                <NumberField
                  key={h.value}
                  id={`h-${h.value}`}
                  label={h.label}
                  suffix="hours"
                  min={1}
                  hint={`${days(draft.healthSlaHours[h.value])} · default ${D.healthSlaHours[h.value]} h`}
                  value={draft.healthSlaHours[h.value]}
                  onChange={(n) => setDraft({ ...draft, healthSlaHours: { ...draft.healthSlaHours, [h.value]: n } })}
                />
              ))}
            </Group>

            <Group title="At-risk warning" note="When a claim is flagged as running late">
              <NumberField
                id="risk"
                label="Flag when time remaining is below"
                suffix="%"
                min={1}
                hint={`Of the target window. Default ${Math.round(D.atRiskThresholdPct * 100)}%`}
                value={Math.round(draft.atRiskThresholdPct * 100)}
                onChange={(n) => setDraft({ ...draft, atRiskThresholdPct: Math.min(100, n) / 100 })}
              />
            </Group>
          </div>
        </SettingsCard>
      </div>

      <div className="no-print sticky bottom-4 z-20 mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-pop backdrop-blur">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700" role="status">
            {dirty ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> You have unsaved changes
              </>
            ) : (
              <>
                <Check className="h-4 w-4 text-emerald-600" aria-hidden /> All changes saved
              </>
            )}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="secondary" icon={RotateCcw} className="flex-1 sm:flex-none" disabled={isDefault} onClick={() => setDraft(structuredClone(D))}>
              Reset to defaults
            </Button>
            <Button icon={Save} className="flex-1 sm:flex-none" onClick={save} disabled={!dirty} loading={saving}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
