import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, ChartColumn, CircleAlert, CircleX, ClipboardList, Clock, Database, Gauge, Hourglass, RotateCcw, Settings, Table2, Zap, type LucideIcon } from 'lucide-react';
import { CLAIM_TYPE_LABELS, DELAY_REASON_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { ALL_STATUSES, STATUS_LABELS } from '../../domain/statusMachine';
import type { ClaimType } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useAllRules } from '../../store/hooks';
import { adminService } from '../../services';
import { toast } from '../../store/toastStore';
import { clearAiCache } from '../../store/useAiResource';
import { STATUS_STYLES } from '../../components/badges';
import { Button, ButtonLink, Card, InfoTip, PageHeader, StatCard } from '../../components/ui';
import { useCopilotPage } from '../copilot/pages';
import { AiInsights } from './AiInsights';
import { dashboardPage } from './aiLogic';
import { computeDashboardStats, computeFigures } from './stats';

// Recharts needs colour strings. Statuses use their own chart colour from badges.tsx; claim types use the
// brand teal ramp (brand-700 / 500 / 300 in index.css). Axes and grid use slate tints.
const TYPE_COLORS = ['#115e59', '#0d9488', '#5eead4'];
const AXIS_TICK = { fontSize: 12, fill: '#64748b' };
const GRID = '#eef2f6';
const CURSOR = { fill: 'rgba(15, 118, 110, 0.06)' };
const LABEL_STYLE = { fontSize: 12, fontWeight: 600, fill: '#0f172a' };

interface Datum {
  name: string;
  value: number;
  color: string;
  note?: string;
}

export default function AdminDashboard() {
  const { claims, refreshClaims, init, config, loaded } = useAppStore();
  const rulesMap = useAllRules();
  const [resetting, setResetting] = useState(false);

  // The same figures feed Ease's read on operations (see stats.ts), so the cards and the insights always agree.
  const kpi = useMemo(() => computeFigures(claims, rulesMap), [claims, rulesMap]);
  const stats = useMemo(() => computeDashboardStats(claims, config, new Date(), rulesMap), [claims, config, rulesMap]);
  useCopilotPage(loaded ? dashboardPage(stats) : null);

  const byStatus: Datum[] = ALL_STATUSES.map((s) => ({ name: STATUS_LABELS[s], value: claims.filter((c) => c.status === s).length, color: STATUS_STYLES[s].chart })).filter((d) => d.value > 0);
  const byType: Datum[] = (Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map((t, i) => {
    const ofType = claims.filter((c) => c.claimType === t);
    return {
      name: CLAIM_TYPE_LABELS[t],
      value: ofType.length,
      color: TYPE_COLORS[i % TYPE_COLORS.length],
      note: `${formatUSD(ofType.reduce((s, c) => s + c.estimatedAmount, 0))} claimed`,
    };
  });

  const topDelays = kpi.delays.slice(0, 8).map((d) => ({ name: DELAY_REASON_LABELS[d.reason], value: d.count }));
  const maxDelay = Math.max(1, ...topDelays.map((d) => d.value));

  async function reset() {
    setResetting(true);
    await adminService.resetDemoData();
    clearAiCache(); // remembered AI answers described the old data
    await init();
    await refreshClaims();
    setResetting(false);
    toast.success('Sample data reset', 'The original claims and policies are back.');
  }

  const fmtHours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

  return (
    <div>
      <PageHeader
        title="Claims operations dashboard"
        subtitle="Live view across Auto, Property and Health claims."
        actions={
          <ButtonLink to="/admin/config" variant="secondary" icon={Settings}>
            Rules & SLA config
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <AiInsights stats={stats} />

        <section aria-label="Key figures" data-tour="kpis" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={ClipboardList} label="Total claims" value={kpi.total} hint={`${kpi.decided} decided`} />
          <StatCard icon={Clock} label="Avg. time to decision" value={kpi.decided && kpi.avgHours !== null ? fmtHours(kpi.avgHours) : '—'} hint="Filing to first decision" />
          <StatCard icon={Zap} tone="emerald" label="Fast-tracked" value={`${kpi.fastPct.toFixed(0)}%`} hint="Eligible or routed" />
          <StatCard icon={CircleAlert} tone="amber" label="Needed more info" value={`${kpi.infoPct.toFixed(0)}%`} hint="Of all claims" />
          <StatCard icon={CircleX} tone="red" label="Denial rate" value={`${kpi.denialRate.toFixed(0)}%`} hint="Of decisions made" />
          <StatCard icon={RotateCcw} label="Appeals" value={kpi.appealed} hint="Claims challenged after a decision" />
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard className="lg:col-span-3" icon={Activity} title="Claims by status" table={byStatus.map((d) => [d.name, d.value])}>
            <ResponsiveContainer width="100%" height={Math.max(200, byStatus.length * 32 + 16)}>
              <BarChart data={byStatus} layout="vertical" margin={{ left: 0, right: 28, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={124} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip cursor={CURSOR} content={<ChartTooltip unit="claim" />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={18}>
                  {byStatus.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                  <LabelList dataKey="value" position="right" style={LABEL_STYLE} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard className="lg:col-span-2" icon={ChartColumn} title="Claims by type" table={byType.map((d) => [d.name, d.value])}>
            <ResponsiveContainer width="100%" height={Math.max(200, byStatus.length * 32 + 16)}>
              <BarChart data={byType} margin={{ left: -12, right: 8, top: 24, bottom: 4 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
                <Tooltip cursor={CURSOR} content={<ChartTooltip unit="claim" />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                  {byType.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                  <LabelList dataKey="value" position="top" style={LABEL_STYLE} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card
            className="lg:col-span-3"
            icon={Hourglass}
            title={
              <>
                Top delay reasons
                <InfoTip label="About delay reasons">Claims affected by each reason: review triggers, information requests, appeals and third parties.</InfoTip>
              </>
            }
          >
            {topDelays.length ? (
              <ol className="space-y-3.5">
                {topDelays.map((d) => (
                  <li key={d.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">{d.name}</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {d.value}
                        <span className="sr-only"> {d.value === 1 ? 'claim' : 'claims'}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.value / maxDelay) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">No delays recorded yet.</p>
            )}
          </Card>

          <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-5 lg:col-span-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-brand-100">
              <Gauge className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-semibold text-slate-900">Uncertainty drives workload</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Claims with more missing, estimated or disputed information need more investigation and human review. Reduce the uncertainty at intake (readiness score, document checklist) and more claims qualify for <strong className="font-semibold text-slate-800">fast-track</strong>.
            </p>
            <Link to="/admin/config" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline">
              <Settings className="h-4 w-4" aria-hidden /> Tune thresholds in Rules & SLA config
            </Link>
          </section>
        </div>

        <section aria-labelledby="data-title" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 px-5 py-4">
          <div className="flex items-center gap-3">
            <Database className="h-4 w-4 text-slate-400" aria-hidden />
            <div>
              <h2 id="data-title" className="eyebrow">
                Data
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">Restore the original claims and policies.</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={reset} loading={resetting}>
            Reset sample data
          </Button>
        </section>
      </div>
    </div>
  );
}

function ChartCard({ title, icon, children, table, className }: { title: string; icon: LucideIcon; children: ReactNode; table: (string | number)[][]; className?: string }) {
  const [showTable, setShowTable] = useState(false);
  const empty = table.every(([, v]) => !v);
  return (
    <Card
      className={className}
      title={title}
      icon={icon}
      actions={
        !empty && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={() => setShowTable((s) => !s)}
            aria-pressed={showTable}
          >
            {showTable ? <ChartColumn className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
            {showTable ? 'Show chart' : 'View as table'}
          </button>
        )
      }
    >
      {empty ? (
        <p className="py-6 text-center text-sm text-slate-500">No claims to chart yet.</p>
      ) : showTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Claims</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.map(([k, v]) => (
              <tr key={String(k)}>
                <th scope="row" className="py-2 text-left font-normal text-slate-700">
                  {k}
                </th>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        children
      )}
    </Card>
  );
}

/** Dark, rounded tooltip shared by the charts. Recharts clones this element with the hovered `payload`. */
function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Datum }>; unit: string }) {
  const d = active ? payload?.[0]?.payload : undefined;
  if (!d) return null;
  return (
    <div className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-pop">
      <p className="flex items-center gap-2 font-semibold">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
        {d.name}
      </p>
      <p className="mt-0.5 text-slate-300">
        {d.value} {d.value === 1 ? unit : `${unit}s`}
        {d.note ? ` · ${d.note}` : ''}
      </p>
    </div>
  );
}
