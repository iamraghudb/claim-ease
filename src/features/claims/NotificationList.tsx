import { Link } from 'react-router-dom';
import { Activity, Banknote, Bell, CircleAlert, CircleCheck, ChevronRight, Gavel, RotateCcw, UserCheck, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationType } from '../../domain/types';
import { notificationService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { formatDateTime, timeAgo } from '../../components/format';
import { cx, EmptyState } from '../../components/ui';

const ICONS: Record<NotificationType, LucideIcon> = {
  STATUS: Activity,
  INFO_REQUEST: CircleAlert,
  DECISION: Gavel,
  PAYMENT: Banknote,
  APPEAL: RotateCcw,
  ASSIGNMENT: UserCheck,
};

const TONES: Record<NotificationType, string> = {
  STATUS: 'bg-brand-50 text-brand-700',
  INFO_REQUEST: 'bg-amber-50 text-amber-700',
  DECISION: 'bg-slate-100 text-slate-700',
  PAYMENT: 'bg-emerald-50 text-emerald-700',
  APPEAL: 'bg-fuchsia-50 text-fuchsia-700',
  ASSIGNMENT: 'bg-sky-50 text-sky-700',
};

const LABELS: Record<NotificationType, string> = {
  STATUS: 'Status change',
  INFO_REQUEST: 'Information request',
  DECISION: 'Decision',
  PAYMENT: 'Payment',
  APPEAL: 'Appeal',
  ASSIGNMENT: 'Assignment',
};

/** Splits an already-sorted list into Today / Yesterday / Earlier (local time), dropping empty groups. */
function groupByDay(list: AppNotification[], now = new Date()) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  const groups = [
    { label: 'Today', items: [] as AppNotification[] },
    { label: 'Yesterday', items: [] as AppNotification[] },
    { label: 'Earlier', items: [] as AppNotification[] },
  ];
  for (const n of list) {
    const t = new Date(n.createdAt).getTime();
    (t >= startToday ? groups[0] : t >= startYesterday ? groups[1] : groups[2]).items.push(n);
  }
  return groups.filter((g) => g.items.length);
}

export function NotificationList({ limit, compact, filter }: { limit?: number; compact?: boolean; filter?: NotificationType | 'ALL' }) {
  const { notifications, role, refreshNotifications } = useAppStore();
  let list = filter && filter !== 'ALL' ? notifications.filter((n) => n.type === filter) : notifications;
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (limit) list = list.slice(0, limit);

  if (!list.length)
    return compact ? (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CircleCheck className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm font-medium text-slate-600">You&apos;re all caught up.</p>
      </div>
    ) : filter && filter !== 'ALL' ? (
      <EmptyState icon={Bell} title="Nothing in this view" message="No notifications of this kind yet. Try another filter." />
    ) : (
      <EmptyState icon={Bell} title="You're all caught up" message="Status changes, information requests, decisions and payments will show up here." />
    );

  const linkFor = (claimNumber: string) => (role === 'ADJUSTER' || role === 'ADMIN' ? `/queue/${claimNumber}` : `/claims/${claimNumber}`);

  const row = (n: AppNotification) => (
    <li key={n.id}>
      <NotificationRow
        n={n}
        compact={compact}
        to={linkFor(n.claimNumber)}
        onOpen={() => {
          if (!n.read) void notificationService.markRead(n.id).then(refreshNotifications);
        }}
      />
    </li>
  );

  if (compact) return <ul className="divide-y divide-slate-100">{list.map(row)}</ul>;

  return (
    <div className="space-y-6">
      {groupByDay(list).map((g) => (
        <section key={g.label}>
          <h2 className="eyebrow mb-2 flex items-center gap-2 px-1">
            {g.label}
            <span className="rounded-full bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">{g.items.length}</span>
          </h2>
          <ul aria-label={g.label} className="card divide-y divide-slate-100 overflow-hidden">
            {g.items.map(row)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({ n, compact, to, onOpen }: { n: AppNotification; compact?: boolean; to: string; onOpen: () => void }) {
  const Icon = ICONS[n.type];
  return (
    <Link
      to={to}
      onClick={onOpen}
      className={cx(
        'group relative flex items-start gap-3 transition-colors focus-visible:outline-offset-[-2px]',
        compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5',
        n.read ? 'hover:bg-slate-50 focus-visible:bg-slate-50' : 'bg-brand-50/50 hover:bg-brand-50 focus-visible:bg-brand-50',
      )}
    >
      {!n.read && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}
      <span className={cx('grid shrink-0 place-items-center rounded-xl', compact ? 'h-9 w-9' : 'h-10 w-10', TONES[n.type])}>
        <Icon className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className={cx('text-sm leading-snug', n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>
            {!n.read && <span className="sr-only">Unread: </span>}
            {n.title}
          </span>
          <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-slate-500">
            <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
              {timeAgo(n.createdAt)}
            </time>
            {!n.read && <span aria-hidden className="h-2 w-2 rounded-full bg-brand-600 ring-4 ring-brand-100" />}
          </span>
        </span>
        <span className={cx('mt-0.5 block text-sm leading-snug text-slate-600', compact && 'line-clamp-2')}>{n.message}</span>
        {!compact && (
          <span className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="font-semibold">{LABELS[n.type]}</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{n.claimNumber}</span>
          </span>
        )}
      </span>
      {!compact && <ChevronRight className="mt-2.5 hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" aria-hidden />}
    </Link>
  );
}
