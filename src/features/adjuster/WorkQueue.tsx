import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpDown, Funnel, Inbox, Zap } from 'lucide-react';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { getSlaStatus, SLA_DISCLAIMER, type SlaState } from '../../domain/sla';
import { ALL_STATUSES, STATUS_LABELS } from '../../domain/statusMachine';
import type { ClaimStatus, ClaimType, Priority } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useAllRules } from '../../store/hooks';
import { ClaimTypeTag, ComplexityBadge, PriorityBadge, SlaBadge, StatusBadge } from '../../components/badges';
import { Alert, Card, cx, EmptyState, PageHeader } from '../../components/ui';
import { Lock } from 'lucide-react';
import { DELAY_REASON_LABELS } from '../../domain/catalog';

type SortKey = 'sla' | 'priority' | 'amount' | 'created' | 'uncertainty';
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default function WorkQueue() {
  const { claims, actor, config } = useAppStore();
  const rulesMap = useAllRules();
  const navigate = useNavigate();
  const [type, setType] = useState<ClaimType | ''>('');
  const [status, setStatus] = useState<ClaimStatus | 'OPEN' | ''>('OPEN');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [sla, setSla] = useState<SlaState | ''>('');
  const [owner, setOwner] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [sort, setSort] = useState<SortKey>('sla');
  const [dir, setDir] = useState<1 | -1>(1);
  const now = new Date();

  const rows = useMemo(() => {
    const list = claims
      .map((c) => ({ claim: c, rules: rulesMap.get(c.claimNumber)!, sla: getSlaStatus(c, now, config) }))
      .filter(({ claim }) => !type || claim.claimType === type)
      .filter(({ claim }) => (status === 'OPEN' ? !['CLOSED', 'PAID'].includes(claim.status) : !status || claim.status === status))
      .filter(({ rules }) => !priority || rules.priority === priority)
      .filter(({ sla: s }) => !sla || s.state === sla)
      .filter(({ claim }) => (owner === 'all' ? true : owner === 'mine' ? claim.assignedAdjuster === actor.name : !claim.assignedAdjuster));
    const val = (r: (typeof list)[number]) => {
      switch (sort) {
        case 'sla':
          return new Date(r.claim.slaDueDate).getTime();
        case 'priority':
          return PRIORITY_RANK[r.rules.priority];
        case 'amount':
          return r.claim.estimatedAmount;
        case 'uncertainty':
          return r.rules.uncertaintyScore;
        default:
          return new Date(r.claim.createdAt).getTime();
      }
    };
    return list.sort((a, b) => (val(a) - val(b)) * dir);
  }, [claims, rulesMap, type, status, priority, sla, owner, sort, dir, actor.name, config]);

  const role = useAppStore((st) => st.role);
  if (role !== 'ADJUSTER' && role !== 'ADMIN')
    return (
      <Alert tone="info" icon={Lock} title="Adjuster workspace">
        Switch to the Adjuster / Examiner or Admin role in the header to see the work queue.
      </Alert>
    );

  const open = claims.filter((c) => !['CLOSED', 'PAID'].includes(c.status));
  const stats = {
    open: open.length,
    overdue: open.filter((c) => getSlaStatus(c, now, config).state === 'OVERDUE').length,
    atRisk: open.filter((c) => getSlaStatus(c, now, config).state === 'AT_RISK').length,
    fastTrack: open.filter((c) => rulesMap.get(c.claimNumber)?.fastTrackEligible).length,
    unassigned: open.filter((c) => !c.assignedAdjuster).length,
  };

  const SortButton = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      className={cx('inline-flex items-center gap-1 font-medium uppercase tracking-wide', sort === k ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800')}
      onClick={() => (sort === k ? setDir((d) => (d === 1 ? -1 : 1)) : (setSort(k), setDir(k === 'amount' || k === 'uncertainty' ? -1 : 1)))}
      aria-label={`Sort by ${k}${sort === k ? (dir === 1 ? ', ascending' : ', descending') : ''}`}
    >
      {children} <ArrowUpDown className="h-3 w-3" aria-hidden />
    </button>
  );

  return (
    <div>
      <PageHeader title="Work queue" subtitle={`Signed in as ${actor.name}. Highest-uncertainty claims need the most human attention.`} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Open claims', value: stats.open, onClick: () => { setStatus('OPEN'); setSla(''); setOwner('all'); } },
          { label: 'SLA overdue', value: stats.overdue, tone: 'text-red-700', onClick: () => setSla('OVERDUE') },
          { label: 'At risk', value: stats.atRisk, tone: 'text-amber-700', onClick: () => setSla('AT_RISK') },
          { label: 'Unassigned', value: stats.unassigned, onClick: () => setOwner('unassigned') },
          { label: 'Fast-track eligible', value: stats.fastTrack, tone: 'text-emerald-700', icon: Zap, onClick: () => setPriority('LOW') },
        ].map((s) => (
          <button key={s.label} type="button" onClick={s.onClick} className="card p-3 text-left transition hover:border-brand-300">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className={cx('mt-1 flex items-center gap-1 text-2xl font-bold', s.tone ?? 'text-slate-900')}>
              {s.icon && <s.icon className="h-5 w-5" aria-hidden />}
              {s.value}
            </p>
          </button>
        ))}
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
          <span className="flex items-center gap-1 self-center text-sm font-medium text-slate-700">
            <Funnel className="h-4 w-4" aria-hidden /> Filters
          </span>
          <Select label="Type" value={type} onChange={(v) => setType(v as ClaimType | '')} options={[['', 'All types'], ...Object.entries(CLAIM_TYPE_LABELS)]} />
          <Select label="Status" value={status} onChange={(v) => setStatus(v as ClaimStatus | 'OPEN' | '')} options={[['OPEN', 'Open (not paid/closed)'], ['', 'All statuses'], ...ALL_STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string])]} />
          <Select label="Priority" value={priority} onChange={(v) => setPriority(v as Priority | '')} options={[['', 'Any priority'], ['URGENT', 'Urgent'], ['HIGH', 'High'], ['NORMAL', 'Normal'], ['LOW', 'Low (fast-track)']]} />
          <Select label="SLA" value={sla} onChange={(v) => setSla(v as SlaState | '')} options={[['', 'Any SLA'], ['OVERDUE', 'Overdue'], ['AT_RISK', 'At risk'], ['ON_TRACK', 'On track'], ['PAUSED', 'Paused'], ['MET', 'Met'], ['MISSED', 'Missed']]} />
          <Select label="Owner" value={owner} onChange={(v) => setOwner(v as typeof owner)} options={[['all', 'Everyone'], ['mine', 'Assigned to me'], ['unassigned', 'Unassigned']]} />
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            options={[['sla', 'SLA due'], ['priority', 'Priority'], ['uncertainty', 'Uncertainty'], ['amount', 'Amount'], ['created', 'Created']]}
          />
        </div>

        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Inbox} title="Queue is clear" message="No claims match these filters." />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Claims work queue</caption>
                <thead className="bg-slate-50 text-left text-xs">
                  <tr>
                    <th className="px-3 py-2.5 font-medium uppercase tracking-wide text-slate-500">Claim</th>
                    <th className="px-3 py-2.5 font-medium uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-3 py-2.5"><SortButton k="priority">Priority</SortButton></th>
                    <th className="px-3 py-2.5"><SortButton k="uncertainty">Flags</SortButton></th>
                    <th className="px-3 py-2.5 text-right"><SortButton k="amount">Amount</SortButton></th>
                    <th className="px-3 py-2.5 font-medium uppercase tracking-wide text-slate-500">Adjuster</th>
                    <th className="px-3 py-2.5"><SortButton k="sla">SLA</SortButton></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(({ claim: c, rules: r }) => (
                    <tr key={c.claimNumber} className="cursor-pointer hover:bg-brand-50/40" onClick={() => navigate(`/queue/${c.claimNumber}`)}>
                      <td className="px-3 py-3">
                        <Link to={`/queue/${c.claimNumber}`} className="font-mono font-semibold text-brand-800 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.claimNumber}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <ClaimTypeTag type={c.claimType} /> · {c.claimantName}
                        </div>
                      </td>
                      <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-3"><PriorityBadge priority={r.priority} /></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.fastTrackEligible ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Zap className="h-3 w-3" aria-hidden />Fast-track</span>
                          ) : (
                            <ComplexityBadge complexity={r.complexity} />
                          )}
                          {[...new Set(r.triggers.map((t) => t.delayReason))].slice(0, 2).map((d) => (
                            <span key={d} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{DELAY_REASON_LABELS[d]}</span>
                          ))}
                          {r.triggers.length > 2 && <span className="text-[11px] text-slate-400">+{r.triggers.length - 2}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatUSD(c.estimatedAmount)}</td>
                      <td className="px-3 py-3 text-slate-600">{c.assignedAdjuster ?? <span className="text-amber-700">Unassigned</span>}</td>
                      <td className="px-3 py-3"><SlaBadge claim={c} compact /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 lg:hidden">
              {rows.map(({ claim: c, rules: r }) => (
                <li key={c.claimNumber}>
                  <Link to={`/queue/${c.claimNumber}`} className="block p-3 hover:bg-slate-50">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{c.claimNumber}</span>
                      <StatusBadge status={c.status} />
                      <PriorityBadge priority={r.priority} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <ClaimTypeTag type={c.claimType} />
                      <span>{formatUSD(c.estimatedAmount)}</span>
                      <span>{c.assignedAdjuster ?? 'Unassigned'}</span>
                      <SlaBadge claim={c} compact />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div className="mt-4">
        <Alert tone="info">{SLA_DISCLAIMER}</Alert>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const id = `wq-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <select id={id} className="input w-auto py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
