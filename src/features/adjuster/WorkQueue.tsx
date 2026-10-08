import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Clock, Inbox, Lock, RotateCcw, Search, TriangleAlert, UserRoundPlus, X, Zap, type LucideIcon } from 'lucide-react';
import { CLAIM_TYPE_LABELS, DELAY_REASON_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { getSlaStatus, type SlaState } from '../../domain/sla';
import { ALL_STATUSES, STATUS_LABELS } from '../../domain/statusMachine';
import type { ClaimStatus, ClaimType, Priority, RulesResult } from '../../domain/types';
import { useAppStore } from '../../store/appStore';
import { useAllRules } from '../../store/hooks';
import { ClaimTypeIcon, ComplexityBadge, PriorityBadge, SlaBadge, SlaInfo, StatusBadge } from '../../components/badges';
import { Alert, Avatar, Button, cx, EmptyState, PageHeader } from '../../components/ui';
import { useCopilotPage } from '../copilot/pages';
import { queuePage } from './copilotData';

type SortKey = 'sla' | 'priority' | 'amount' | 'created' | 'uncertainty';
const PRIORITY_RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const SORT_LABELS: Record<SortKey, string> = { sla: 'SLA due', priority: 'Priority', uncertainty: 'Uncertainty', amount: 'Amount', created: 'Created' };
const defaultDir = (k: SortKey): 1 | -1 => (k === 'amount' || k === 'uncertainty' ? -1 : 1);

const TD = 'border-b border-slate-100 px-3 py-3.5 align-middle transition-colors group-hover:bg-slate-50';
const TH = 'sticky top-16 z-10 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left align-middle';

export default function WorkQueue() {
  const { claims, actor, config, loaded } = useAppStore();
  const rulesMap = useAllRules();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ClaimType | ''>('');
  const [status, setStatus] = useState<ClaimStatus | 'OPEN' | ''>('OPEN');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [sla, setSla] = useState<SlaState | ''>('');
  const [owner, setOwner] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [fastTrack, setFastTrack] = useState(false);
  const [sort, setSort] = useState<SortKey>('sla');
  const [dir, setDir] = useState<1 | -1>(1);
  const now = new Date();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = claims
      .map((c) => ({ claim: c, rules: rulesMap.get(c.claimNumber)!, sla: getSlaStatus(c, now, config) }))
      .filter(({ claim }) => !q || [claim.claimNumber, claim.claimantName, claim.policyNumber, claim.assignedAdjuster ?? '', CLAIM_TYPE_LABELS[claim.claimType]].some((v) => v.toLowerCase().includes(q)))
      .filter(({ claim }) => !type || claim.claimType === type)
      .filter(({ claim }) => (status === 'OPEN' ? !['CLOSED', 'PAID'].includes(claim.status) : !status || claim.status === status))
      .filter(({ rules }) => !priority || rules.priority === priority)
      .filter(({ rules }) => !fastTrack || rules.fastTrackEligible)
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
  }, [claims, rulesMap, query, type, status, priority, fastTrack, sla, owner, sort, dir, actor.name, config]);

  const role = useAppStore((st) => st.role);
  // Tell Ease what the queue holds: the five tile counts and the most urgent claims, with no names.
  const copilotPage = useMemo(() => (loaded && (role === 'ADJUSTER' || role === 'ADMIN') ? queuePage(claims, rulesMap, config, new Date()) : null), [loaded, claims, rulesMap, config, role]);
  useCopilotPage(copilotPage);
  if (role !== 'ADJUSTER' && role !== 'ADMIN')
    return (
      <Alert tone="info" icon={Lock} title="Adjuster workspace">
        Switch to the Adjuster or Admin role in the header to see the work queue.
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

  const filtersDirty = !!query.trim() || !!type || status !== 'OPEN' || !!priority || !!sla || owner !== 'all' || fastTrack;
  const resetFilters = () => {
    setQuery('');
    setType('');
    setStatus('OPEN');
    setPriority('');
    setSla('');
    setOwner('all');
    setFastTrack(false);
  };
  const chooseSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(k);
      setDir(defaultDir(k));
    }
  };

  const tiles: { key: string; label: string; hint: string; value: number; icon: LucideIcon; tone: Tone; active: boolean; onClick: () => void }[] = [
    {
      key: 'open',
      label: 'Open claims',
      hint: 'Not paid or closed',
      value: stats.open,
      icon: Inbox,
      tone: 'brand',
      active: status === 'OPEN' && !sla && owner === 'all' && !fastTrack,
      onClick: () => {
        setStatus('OPEN');
        setSla('');
        setOwner('all');
        setFastTrack(false);
      },
    },
    {
      key: 'atRisk',
      label: 'At risk',
      hint: 'Due soon',
      value: stats.atRisk,
      icon: Clock,
      tone: 'amber',
      active: sla === 'AT_RISK',
      onClick: () => {
        setStatus('OPEN');
        setSla(sla === 'AT_RISK' ? '' : 'AT_RISK');
      },
    },
    {
      key: 'overdue',
      label: 'Overdue',
      hint: 'Past the SLA target',
      value: stats.overdue,
      icon: TriangleAlert,
      tone: 'red',
      active: sla === 'OVERDUE',
      onClick: () => {
        setStatus('OPEN');
        setSla(sla === 'OVERDUE' ? '' : 'OVERDUE');
      },
    },
    {
      key: 'fastTrack',
      label: 'Fast-track eligible',
      hint: 'Can skip investigation',
      value: stats.fastTrack,
      icon: Zap,
      tone: 'emerald',
      active: fastTrack,
      onClick: () => {
        setStatus('OPEN');
        setFastTrack((f) => !f);
      },
    },
    {
      key: 'unassigned',
      label: 'Unassigned',
      hint: 'Waiting for an adjuster',
      value: stats.unassigned,
      icon: UserRoundPlus,
      tone: 'slate',
      active: owner === 'unassigned',
      onClick: () => {
        setStatus('OPEN');
        setOwner((o) => (o === 'unassigned' ? 'all' : 'unassigned'));
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Work queue" subtitle={`Signed in as ${actor.name}. Claims with the most uncertainty need the most human attention.`} />

      <section aria-label="Queue at a glance" data-tour="queue-tiles" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map(({ key, ...t }, i) => (
          <Tile key={key} {...t} className={i === tiles.length - 1 ? 'col-span-2 md:col-span-1' : undefined} />
        ))}
      </section>

      <section aria-label="Filters" className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="wq-search" className="sr-only">
              Search claims
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="wq-search"
              type="text"
              inputMode="search"
              autoComplete="off"
              className="input pl-10 pr-10"
              placeholder="Search by claim number, claimant or policy"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={resetFilters} disabled={!filtersDirty} className="self-start sm:self-auto">
            Reset filters
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Type" value={type} active={!!type} onChange={(v) => setType(v as ClaimType | '')} options={[['', 'All types'], ...Object.entries(CLAIM_TYPE_LABELS)]} />
          <FilterSelect
            label="Status"
            value={status}
            active={status !== 'OPEN'}
            onChange={(v) => setStatus(v as ClaimStatus | 'OPEN' | '')}
            options={[['OPEN', 'Open claims'], ['', 'All statuses'], ...ALL_STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string])]}
          />
          <FilterSelect label="Priority" value={priority} active={!!priority} onChange={(v) => setPriority(v as Priority | '')} options={[['', 'Any priority'], ['URGENT', 'Urgent'], ['HIGH', 'High'], ['NORMAL', 'Normal'], ['LOW', 'Low (fast-track)']]} />
          <FilterSelect
            label="SLA"
            value={sla}
            active={!!sla}
            onChange={(v) => setSla(v as SlaState | '')}
            options={[['', 'Any SLA'], ['OVERDUE', 'Overdue'], ['AT_RISK', 'At risk'], ['ON_TRACK', 'On track'], ['PAUSED', 'Paused'], ['MET', 'Met'], ['MISSED', 'Missed']]}
          />
          <FilterSelect label="Owner" value={owner} active={owner !== 'all'} onChange={(v) => setOwner(v as typeof owner)} options={[['all', 'Everyone'], ['mine', 'Assigned to me'], ['unassigned', 'Unassigned']]} />
        </div>
      </section>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600" aria-live="polite">
          <span className="font-semibold text-slate-900">{rows.length}</span> {rows.length === 1 ? 'claim' : 'claims'}
          {filtersDirty && <span className="text-slate-500"> of {claims.length}</span>}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="wq-sort" className="text-xs font-semibold text-slate-500">
            Sort by
          </label>
          <SelectBox id="wq-sort" value={sort} onChange={(v) => chooseSort(v as SortKey)} options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => [k, SORT_LABELS[k]])} className="py-1.5 text-sm" />
          <button
            type="button"
            onClick={() => setDir((d) => (d === 1 ? -1 : 1))}
            className="rounded-lg p-2 text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label={dir === 1 ? 'Sorted ascending. Switch to descending' : 'Sorted descending. Switch to ascending'}
            title={dir === 1 ? 'Ascending' : 'Descending'}
          >
            {dir === 1 ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtersDirty ? 'No claims match these filters' : 'Queue is clear'}
          message={filtersDirty ? 'Try a different search, or reset the filters to see every open claim.' : 'Nothing is waiting for an adjuster right now.'}
          action={
            filtersDirty && (
              <Button variant="secondary" icon={RotateCcw} onClick={resetFilters}>
                Reset filters
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden lg:block" data-tour="queue-table">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">Claims work queue</caption>
              <thead>
                <tr>
                  <th scope="col" className={cx(TH, 'rounded-tl-2xl pl-4')}>
                    <HeadLabel>Claim</HeadLabel>
                  </th>
                  <th scope="col" className={TH}>
                    <HeadLabel>Status</HeadLabel>
                  </th>
                  <th scope="col" className={TH} aria-sort={ariaSort(sort === 'priority', dir)}>
                    <SortButton k="priority" active={sort === 'priority'} dir={dir} onSort={chooseSort}>
                      Priority
                    </SortButton>
                  </th>
                  <th scope="col" className={cx(TH, 'hidden xl:table-cell')} aria-sort={ariaSort(sort === 'uncertainty', dir)}>
                    <SortButton k="uncertainty" active={sort === 'uncertainty'} dir={dir} onSort={chooseSort}>
                      Review flags
                    </SortButton>
                  </th>
                  <th scope="col" className={TH} aria-sort={ariaSort(sort === 'sla', dir)}>
                    <span className="inline-flex items-center gap-1">
                      <SortButton k="sla" active={sort === 'sla'} dir={dir} onSort={chooseSort}>
                        SLA
                      </SortButton>
                      <SlaInfo />
                    </span>
                  </th>
                  <th scope="col" className={cx(TH, 'text-right')} aria-sort={ariaSort(sort === 'amount', dir)}>
                    <SortButton k="amount" active={sort === 'amount'} dir={dir} onSort={chooseSort}>
                      Amount
                    </SortButton>
                  </th>
                  <th scope="col" className={cx(TH, 'rounded-tr-2xl pr-4')}>
                    <HeadLabel>Owner</HeadLabel>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td:first-child]:rounded-bl-2xl [&>tr:last-child>td:last-child]:rounded-br-2xl [&>tr:last-child>td]:border-b-0">
                {rows.map(({ claim: c, rules: r }) => (
                  <tr key={c.claimNumber} className="group cursor-pointer" onClick={() => navigate(`/queue/${c.claimNumber}`)}>
                    <td className={cx(TD, 'pl-4')}>
                      <div className="flex items-center gap-3">
                        <ClaimTypeIcon type={c.claimType} size="sm" />
                        <div className="min-w-0">
                          <Link to={`/queue/${c.claimNumber}`} className="font-mono text-sm font-semibold text-slate-900 hover:text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                            {c.claimNumber}
                          </Link>
                          <p className="max-w-[11rem] truncate text-xs text-slate-500" title={c.claimantName}>
                            {c.claimantName} · {CLAIM_TYPE_LABELS[c.claimType]}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className={TD}>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className={TD}>
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className={cx(TD, 'hidden xl:table-cell')}>
                      <ReviewFlags rules={r} />
                    </td>
                    <td className={TD}>
                      <SlaBadge claim={c} compact />
                    </td>
                    <td className={cx(TD, 'text-right text-sm font-semibold tabular-nums text-slate-900')}>{formatUSD(c.estimatedAmount)}</td>
                    <td className={cx(TD, 'pr-4')}>
                      <Owner name={c.assignedAdjuster} mine={c.assignedAdjuster === actor.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile and tablet cards */}
          <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
            {rows.map(({ claim: c, rules: r }) => (
              <li key={c.claimNumber}>
                <Link to={`/queue/${c.claimNumber}`} className="card card-hover block h-full p-4">
                  <div className="flex items-start gap-3">
                    <ClaimTypeIcon type={c.claimType} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">{c.claimNumber}</span>
                        <span className="text-sm font-semibold tabular-nums text-slate-900">{formatUSD(c.estimatedAmount)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {c.claimantName} · {CLAIM_TYPE_LABELS[c.claimType]}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={c.status} />
                    <PriorityBadge priority={r.priority} />
                    {r.fastTrackEligible && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <Zap className="h-3 w-3" aria-hidden /> Fast-track
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <Owner name={c.assignedAdjuster} mine={c.assignedAdjuster === actor.name} />
                    <SlaBadge claim={c} compact />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------- Pieces ----------

type Tone = 'brand' | 'amber' | 'emerald' | 'red' | 'slate';
const TILE_TONES: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
};

/** A headline number that is also a one-click filter. */
function Tile({ label, hint, value, icon: Icon, tone, active, onClick, className }: { label: string; hint: string; value: number; icon: LucideIcon; tone: Tone; active: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('card card-hover p-3.5 text-left sm:p-4', active ? 'border-brand-500 ring-2 ring-brand-100' : 'hover:border-slate-300', className)}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', TILE_TONES[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </span>
      <span className="mt-1.5 block text-2xl font-bold tabular-nums tracking-tight text-slate-900">{value}</span>
      <span className="mt-0.5 block truncate text-xs text-slate-500">{hint}</span>
    </button>
  );
}

/** A native select with a custom chevron, so every filter control looks the same. */
function SelectBox({ id, value, onChange, options, active, className }: { id: string; value: string; onChange: (v: string) => void; options: [string, string][]; active?: boolean; className?: string }) {
  return (
    <div className="relative">
      <select id={id} className={cx('input appearance-none pr-9', active && 'border-brand-400 bg-brand-50/50 font-medium text-brand-900', className)} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    </div>
  );
}

function FilterSelect({ label, ...rest }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; active?: boolean }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="eyebrow mb-1 block">
        {label}
      </label>
      <SelectBox id={id} {...rest} className="py-2" />
    </div>
  );
}

const ariaSort = (active: boolean, dir: 1 | -1) => (active ? (dir === 1 ? 'ascending' : 'descending') : undefined);

function HeadLabel({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>;
}

function SortButton({ k, active, dir, onSort, children }: { k: SortKey; active: boolean; dir: 1 | -1; onSort: (k: SortKey) => void; children: ReactNode }) {
  const Icon = active ? (dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      className={cx('eyebrow inline-flex items-center gap-1 rounded transition-colors', active ? 'text-brand-700' : 'hover:text-slate-800')}
      onClick={() => onSort(k)}
      aria-label={`Sort by ${k === 'sla' ? 'SLA' : k}${active ? (dir === 1 ? ', ascending' : ', descending') : ''}`}
    >
      {children} <Icon className={cx('h-3 w-3', !active && 'opacity-60')} aria-hidden />
    </button>
  );
}

function Owner({ name, mine }: { name?: string; mine: boolean }) {
  if (!name)
    return (
      <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-700">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-amber-400 bg-amber-50 text-amber-600">
          <UserRoundPlus className="h-3.5 w-3.5" aria-hidden />
        </span>
        Unassigned
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-700">
      <Avatar name={name} size="sm" tone={mine ? 'teal' : 'slate'} />
      <span className="truncate">
        {name}
        {mine && <span className="ml-1 text-xs font-semibold text-brand-700">(you)</span>}
      </span>
    </span>
  );
}

function ReviewFlags({ rules: r }: { rules: RulesResult }) {
  const reasons = [...new Set(r.triggers.map((t) => t.delayReason))];
  return (
    <div className="flex max-w-[16rem] flex-wrap items-center gap-1.5">
      {r.fastTrackEligible ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <Zap className="h-3 w-3" aria-hidden /> Fast-track
        </span>
      ) : (
        <ComplexityBadge complexity={r.complexity} />
      )}
      {reasons.slice(0, 2).map((d) => (
        <span key={d} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {DELAY_REASON_LABELS[d]}
        </span>
      ))}
      {reasons.length > 2 && <span className="text-[11px] font-medium text-slate-400">+{reasons.length - 2}</span>}
    </div>
  );
}
