import { Link } from 'react-router-dom';
import { Banknote, Bell, CircleAlert, Gavel, RotateCcw, UserCheck, type LucideIcon, Activity } from 'lucide-react';
import type { NotificationType } from '../../domain/types';
import { notificationService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { timeAgo } from '../../components/format';
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
  DECISION: 'bg-violet-50 text-violet-700',
  PAYMENT: 'bg-emerald-50 text-emerald-700',
  APPEAL: 'bg-fuchsia-50 text-fuchsia-700',
  ASSIGNMENT: 'bg-sky-50 text-sky-700',
};

export function NotificationList({ limit, compact, filter }: { limit?: number; compact?: boolean; filter?: NotificationType | 'ALL' }) {
  const { notifications, role, refreshNotifications } = useAppStore();
  let list = filter && filter !== 'ALL' ? notifications.filter((n) => n.type === filter) : notifications;
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (limit) list = list.slice(0, limit);

  if (!list.length)
    return compact ? (
      <p className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</p>
    ) : (
      <EmptyState icon={Bell} title="No notifications" message="Status changes, information requests, decisions and payments will show up here." />
    );

  const linkFor = (claimNumber: string) => (role === 'ADJUSTER' || role === 'ADMIN' ? `/queue/${claimNumber}` : `/claims/${claimNumber}`);

  return (
    <ul className={cx('divide-y divide-slate-100', !compact && 'card overflow-hidden')}>
      {list.map((n) => {
        const Icon = ICONS[n.type];
        return (
          <li key={n.id}>
            <Link
              to={linkFor(n.claimNumber)}
              onClick={() => {
                if (!n.read) void notificationService.markRead(n.id).then(refreshNotifications);
              }}
              className={cx('flex gap-3 px-4 py-3 hover:bg-slate-50', !n.read && 'bg-brand-50/40')}
            >
              <span className={cx('mt-0.5 h-8 w-8 shrink-0 rounded-full p-1.5', TONES[n.type])}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={cx('text-sm', n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</span>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="unread" />}
                </span>
                <span className="block text-sm text-slate-600">{n.message}</span>
                <span className="block text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
