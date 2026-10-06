import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleAlert, Clock, Gauge, RotateCcw, Settings, Zap, CircleX, ClipboardList } from 'lucide-react';
import { CLAIM_TYPE_LABELS, DELAY_REASON_LABELS } from '../../domain/catalog';
import { ALL_STATUSES, STATUS_LABELS } from '../../domain/statusMachine';
import type { ClaimType, DelayReason } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useAllRules } from '../../store/hooks';
import { adminService } from '../../services';
import { toast } from '../../store/toastStore';
import { Button, ButtonLink, Card, PageHeader } from '../../components/ui';

// Chart colors: reference categorical palette slots 1-3 (validated all-pairs) and
// a single hue for magnitude-only charts. Text never wears series color.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const MAGNITUDE = '#2a78d6';
const AXIS = { fontSize: 12, fill: '#52514e' };

const HOUR = 3_600_000;

export default function AdminDashboard() {
  const { claims, refreshClaims, init } = useAppStore();
  const rulesMap = useAllRules();
  const [resetting, setResetting] = useState(false);

  const kpi = useMemo(() => {
    const decided = claims.filter((c) => c.decidedAt);
    const firstDecision = decided.map((c) => {
      const first = c.decisionHistory[0]?.decidedAt ?? c.decidedAt!;
      return (new Date(first).getTime() - new Date(c.createdAt).getTime()) / HOUR;
    });
    const avgHours = firstDecision.length ? firstDecision.reduce((a, b) => a + b, 0) / firstDecision.length : 0;
    const fastTracked = claims.filter(
      (c) => rulesMap.get(c.claimNumber)?.fastTrackEligible || c.auditTrail.some((a) => /fast-track/i.test(a.details ?? '')),
    ).length;
    const everInfo = claims.filter((c) => c.informationRequests.length > 0 || c.status === 'INFORMATION_REQUIRED').length;
    const outcomes = claims.flatMap((c) => (c.decisionHistory.length ? [c.decisionHistory.at(-1)!.outcome] : []));
    const denied = outcomes.filter((o) => o === 'DENIED').length;
    const appealed = claims.filter((c) => c.appeals.length).length;
    return {
      total: claims.length,
      avgHours,
      fastPct: claims.length ? (fastTracked / claims.length) * 100 : 0,
      infoPct: claims.length ? (everInfo / claims.length) * 100 : 0,
      denialRate: outcomes.length ? (denied / outcomes.length) * 100 : 0,
      decided: outcomes.length,
      appealed,
    };
  }, [claims, rulesMap]);

  const byStatus = ALL_STATUSES.map((s) => ({ name: STATUS_LABELS[s], key: s, value: claims.filter((c) => c.status === s).length })).filter((d) => d.value > 0);
  const byType = (Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map((t, i) => ({
    name: CLAIM_TYPE_LABELS[t],
    value: claims.filter((c) => c.claimType === t).length,
    amount: claims.filter((c) => c.claimType === t).reduce((s, c) => s + c.estimatedAmount, 0),
    color: SERIES[i],
  }));

  const delays = useMemo(() => {
    const counts = new Map<DelayReason, number>();
    const add = (r: DelayReason) => counts.set(r, (counts.get(r) ?? 0) + 1);
    for (const c of claims) {
      const reasons = new Set<DelayReason>();
      rulesMap.get(c.claimNumber)?.triggers.forEach((t) => reasons.add(t.delayReason));
      c.informationRequests.forEach((r) => r.items.forEach((i) => reasons.add(i.reason)));
      if (c.appeals.length) reasons.add('VALUE_DISAGREEMENT');
      if (c.expertInputs.length) reasons.add('THIRD_PARTIES');
      reasons.forEach(add);
    }
    return (Object.keys(DELAY_REASON_LABELS) as DelayReason[])
      .map((r) => ({ name: DELAY_REASON_LABELS[r], value: counts.get(r) ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [claims, rulesMap]);

  async function reset() {
    setResetting(true);
    await adminService.resetDemoData();
    await init();
    await refreshClaims();
    setResetting(false);
    toast.success('Demo data reset', 'Seed claims and policies restored.');
  }

  const fmtHours = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`);

  return (
    <div>
      <PageHeader
        title="Claims operations dashboard"
        subtitle="Live view across Auto, Property and Health. All data is simulated."
        actions={
          <>
            <ButtonLink to="/admin/config" variant="secondary" icon={Settings}>
              Rules & SLA config
            </ButtonLink>
            <Button variant="secondary" icon={RotateCcw} onClick={reset} loading={resetting}>
              Reset demo data
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={ClipboardList} label="Total claims" value={String(kpi.total)} sub={`${kpi.decided} decided`} />
        <Kpi icon={Clock} label="Avg. time to decision" value={fmtHours(kpi.avgHours)} sub="first decision" />
        <Kpi icon={Zap} label="Fast-tracked" value={`${kpi.fastPct.toFixed(0)}%`} sub="eligible or routed" />
        <Kpi icon={CircleAlert} label="Required more info" value={`${kpi.infoPct.toFixed(0)}%`} sub="of all claims" />
        <Kpi icon={CircleX} label="Denial rate" value={`${kpi.denialRate.toFixed(0)}%`} sub="of decisions" />
        <Kpi icon={RotateCcw} label="Appealed" value={String(kpi.appealed)} sub="claims" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Claims by status" table={byStatus.map((d) => [d.name, d.value])}>
          <ResponsiveContainer width="100%" height={Math.max(220, byStatus.length * 34)}>
            <BarChart data={byStatus} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} stroke="#e7e5e4" />
              <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} formatter={(v: number) => [v, 'Claims']} />
              <Bar dataKey="value" fill={MAGNITUDE} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#0b0b0b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Claims by type" table={byType.map((d) => [d.name, d.value])}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byType} margin={{ left: 0, right: 8, top: 20, bottom: 4 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="#e7e5e4" />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} formatter={(v: number, _n, p) => [`${v} claims · $${p.payload.amount.toLocaleString()} claimed`, p.payload.name]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {byType.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
                <LabelList dataKey="value" position="top" style={{ fontSize: 12, fill: '#0b0b0b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Top delay reasons" subtitle="Claims affected by each reason (review triggers, information requests, appeals, third parties)" table={delays.map((d) => [d.name, d.value])}>
            <ResponsiveContainer width="100%" height={delays.length * 30 + 20}>
              <BarChart data={delays} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke="#e7e5e4" />
                <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={170} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(42,120,214,0.08)' }} formatter={(v: number) => [v, 'Claims affected']} />
                <Bar dataKey="value" fill={MAGNITUDE} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#0b0b0b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      <Card title="Uncertainty drives workload" icon={Gauge} className="mt-6">
        <p className="text-sm text-slate-600">
          Claims with more missing, estimated or disputed information get more investigation and human review. Lower the uncertainty at intake (readiness score, document checklist) and more claims qualify for{' '}
          <strong>fast-track</strong>. Tune thresholds in <Link to="/admin/config" className="font-medium text-brand-700 underline">Rules & SLA config</Link>.
        </p>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children, table }: { title: string; subtitle?: string; children: ReactNode; table: (string | number)[][] }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card
      title={title}
      actions={
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'View as table'}
        </button>
      }
    >
      {subtitle && <p className="-mt-1 mb-3 text-xs text-slate-500">{subtitle}</p>}
      {showTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <tbody className="divide-y divide-slate-100">
            {table.map(([k, v]) => (
              <tr key={String(k)}>
                <th scope="row" className="py-1.5 text-left font-normal text-slate-700">{k}</th>
                <td className="py-1.5 text-right font-medium tabular-nums">{v}</td>
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
