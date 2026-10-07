import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import type { NotificationType } from '../../domain/types';
import { notificationService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { Button, PageHeader, Tabs } from '../../components/ui';
import { useCopilotPage } from '../copilot/pages';
import { NotificationList } from './NotificationList';

type Filter = NotificationType | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'STATUS', label: 'Status changes' },
  { value: 'INFO_REQUEST', label: 'Info requests' },
  { value: 'DECISION', label: 'Decisions' },
  { value: 'PAYMENT', label: 'Payments' },
  { value: 'APPEAL', label: 'Appeals' },
];

export default function NotificationsPage() {
  const { role, notifications, refreshNotifications } = useAppStore();
  const [filter, setFilter] = useState<Filter>('ALL');
  const unread = notifications.filter((n) => !n.read).length;
  useCopilotPage({
    path: '/notifications',
    title: 'Notifications',
    summary: `Every notification, grouped by day and filterable by type: status changes, info requests, decisions, payments and appeals. ${unread ? `${unread} ${unread === 1 ? 'is' : 'are'} unread.` : 'Everything has been read.'}`,
    suggestions: ['Which notification needs action?', 'What do these statuses mean?'],
  });
  const tabs = FILTERS.map((f) => {
    const n = notifications.filter((x) => !x.read && (f.value === 'ALL' || x.type === f.value)).length;
    return {
      value: f.value,
      label: (
        <span className="inline-flex items-center gap-1.5">
          {f.label}
          {n > 0 && (
            <span className="min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
              {n}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </span>
      ),
    };
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up"}
        actions={
          <Button variant="secondary" icon={CheckCheck} disabled={!unread} onClick={() => void notificationService.markAllRead(role).then(refreshNotifications)}>
            Mark all as read
          </Button>
        }
      />
      <div className="mb-5">
        <Tabs label="Filter notifications" tabs={tabs} value={filter} onChange={setFilter} />
      </div>
      <NotificationList filter={filter} />
    </div>
  );
}
