import api from '../api';

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  type: 'transaction' | 'security' | 'system';
  channel: 'push' | 'email' | 'in_app';
  read: boolean;
  data: Record<string, any> | null;
  createdAt: string;
};

export type NotificationPreference = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

export type NotificationList = {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
};

export async function getNotifications(page = 1, limit = 20): Promise<NotificationList> {
  const res = await api.get<NotificationList>('/notifications', { params: { page, limit } });
  return res.data;
}

export async function getNotificationPreferences(): Promise<NotificationPreference> {
  const res = await api.get<NotificationPreference>('/notifications/preferences');
  return res.data;
}

export async function updateNotificationPreferences(prefs: Partial<NotificationPreference>): Promise<NotificationPreference> {
  const res = await api.patch<NotificationPreference>('/notifications/preferences', prefs);
  return res.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  await api.patch('/notifications/mark-all-read');
}

export async function sendTestPush(title: string, body: string): Promise<void> {
  await api.post('/notifications/send-push', { title, body });
}
