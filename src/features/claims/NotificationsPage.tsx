import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import type { NotificationType } from '../../domain/types';
import { notificationService } from '../../services';
import { useAppStore } from '../../store/appStore';
import { Button, PageHeader, Tabs } from '../../components/ui';
import { NotificationList } from './NotificationList';

const FILTERS: { value: NotificationType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'STATUS', label: 'Status changes' },
  { value: 'INFO_REQUEST', label: 'Info requests' },
  { value: 'DECISION', label: 'Decisions' },
  { value: 'PAYMENT', label: 'Payments' },
  { value: 'APPEAL', label: 'Appeals' },
];

export default function NotificationsPage() {
  const { role, notifications, refreshNotifications } = useAppStore();
  const [filter, setFilter] = useState<NotificationType | 'ALL'>('ALL');
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notification center"
        subtitle={`${unread} unread`}
        actions={
          <Button variant="secondary" icon={CheckCheck} disabled={!unread} onClick={() => void notificationService.markAllRead(role).then(refreshNotifications)}>
            Mark all read
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs label="Filter notifications" tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>
      <NotificationList filter={filter} />
    </div>
  );
}
