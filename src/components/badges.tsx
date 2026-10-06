import { useEffect, useState } from 'react';
import { Car, Clock, Flame, HeartPulse, House, CirclePause, type LucideIcon, Zap } from 'lucide-react';
import { STATUS_LABELS } from '../domain/statusMachine';
import { getSlaStatus, type SlaState } from '../domain/sla';
import type { Claim, ClaimStatus, ClaimType, Complexity, Priority } from '../domain/types';
import { CLAIM_TYPE_LABELS } from '../domain/catalog';
import { cx } from './ui';
import { useAppStore } from '../store/appStore';

// One color per status, used consistently on every screen.
export const STATUS_STYLES: Record<ClaimStatus, { badge: string; dot: string; chart: string }> = {
  REPORTED: { badge: 'bg-slate-100 text-slate-700 ring-slate-300', dot: 'bg-slate-400', chart: '#94a3b8' },
  REGISTERED: { badge: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500', chart: '#0ea5e9' },
  UNDER_REVIEW: { badge: 'bg-blue-50 text-blue-800 ring-blue-200', dot: 'bg-blue-600', chart: '#2563eb' },
  INFORMATION_REQUIRED: { badge: 'bg-amber-50 text-amber-900 ring-amber-300', dot: 'bg-amber-500', chart: '#f59e0b' },
  INVESTIGATION: { badge: 'bg-orange-50 text-orange-800 ring-orange-200', dot: 'bg-orange-500', chart: '#f97316' },
  ADJUDICATION: { badge: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-600', chart: '#7c3aed' },
  APPROVED: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-600', chart: '#059669' },
  PARTIALLY_APPROVED: { badge: 'bg-lime-50 text-lime-800 ring-lime-300', dot: 'bg-lime-600', chart: '#65a30d' },
  DENIED: { badge: 'bg-red-50 text-red-800 ring-red-200', dot: 'bg-red-600', chart: '#dc2626' },
  APPEALED: { badge: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200', dot: 'bg-fuchsia-600', chart: '#c026d3' },
  PAYMENT_PENDING: { badge: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-500', chart: '#14b8a6' },
  PAID: { badge: 'bg-green-100 text-green-900 ring-green-300', dot: 'bg-green-700', chart: '#15803d' },
  CLOSED: { badge: 'bg-slate-200 text-slate-800 ring-slate-300', dot: 'bg-slate-600', chart: '#475569' },
  REOPENED: { badge: 'bg-indigo-50 text-indigo-800 ring-indigo-200', dot: 'bg-indigo-600', chart: '#4f46e5' },
};

export function StatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_STYLES[status].badge, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', STATUS_STYLES[status].dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export const CLAIM_TYPE_ICONS: Record<ClaimType, LucideIcon> = { AUTO: Car, PROPERTY: House, HEALTH: HeartPulse };

export function ClaimTypeTag({ type }: { type: ClaimType }) {
  const Icon = CLAIM_TYPE_ICONS[type];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {CLAIM_TYPE_LABELS[type]}
    </span>
  );
}

const PRIORITY_STYLES: Record<Priority, string> = {
  URGENT: 'bg-red-600 text-white',
  HIGH: 'bg-orange-100 text-orange-800',
  NORMAL: 'bg-slate-100 text-slate-700',
  LOW: 'bg-emerald-50 text-emerald-700',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', PRIORITY_STYLES[priority])}>{priority}</span>;
}

const COMPLEXITY_STYLES: Record<Complexity, string> = {
  LOW: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  MEDIUM: 'text-amber-800 bg-amber-50 ring-amber-200',
  HIGH: 'text-red-700 bg-red-50 ring-red-200',
};

export function ComplexityBadge({ complexity }: { complexity: Complexity }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', COMPLEXITY_STYLES[complexity])}>
      {complexity === 'HIGH' && <Flame className="h-3 w-3" aria-hidden />}
      {complexity.charAt(0) + complexity.slice(1).toLowerCase()} complexity
    </span>
  );
}

export function FastTrackBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white" title="Low uncertainty: can be decided without investigation">
      <Zap className="h-3 w-3" aria-hidden /> Fast-track eligible
    </span>
  );
}

const SLA_STYLES: Record<SlaState, string> = {
  ON_TRACK: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
  AT_RISK: 'text-amber-800 bg-amber-50 ring-amber-300',
  OVERDUE: 'text-white bg-red-600 ring-red-600',
  PAUSED: 'text-slate-700 bg-slate-100 ring-slate-300',
  MET: 'text-emerald-800 bg-emerald-50 ring-emerald-200',
  MISSED: 'text-red-800 bg-red-50 ring-red-200',
};

/** Live-updating SLA countdown. */
export function SlaBadge({ claim, compact }: { claim: Pick<Claim, 'createdAt' | 'slaDueDate' | 'status' | 'decidedAt' | 'slaStartedAt'>; compact?: boolean }) {
  const config = useAppStore((s) => s.config);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (claim.status === 'CLOSED') return <span className="text-xs text-slate-500">—</span>;
  const s = getSlaStatus(claim, now, config);
  const Icon = s.state === 'PAUSED' ? CirclePause : Clock;
  return (
    <span
      className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', SLA_STYLES[s.state])}
      title={`SLA due ${new Date(claim.slaDueDate).toLocaleString()} (illustrative target)`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {compact && s.state === 'PAUSED' ? 'Paused' : s.label}
    </span>
  );
}
