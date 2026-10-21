import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getNotifications, markAllRead } from '@/services/notification.service';
import { connectRealtime } from '@/services/realtime';
import { requestReminderRefresh } from '@/utils/reminders';

interface NotificationContextValue {
  /** How many inbox notifications are still unread. */
  unread: number;
  /** Re-reads the count from the server. */
  refresh: () => Promise<void>;
  /** Screens that already know the new count (after reading or loading the inbox) set it here. */
  setUnread: React.Dispatch<React.SetStateAction<number>>;
  /** Marks everything read, on the server and here. */
  clearUnread: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  unread: 0,
  refresh: async () => {},
  setUnread: () => {},
  clearUnread: async () => {},
});

/**
 * Holds the unread count for the whole signed-in app. It is refreshed when the app starts, when it
 * comes back to the foreground, whenever a push arrives while it is open, and the moment the server
 * reports a new notification over the live connection, so the bell and the
 * Profile badge stay right without each screen asking the server on its own.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try { setUnread((await getNotifications(1, 1)).unreadCount); } catch { /* keep the last count */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
    const received = Notifications.addNotificationReceivedListener(() => { refresh(); });
    return () => { appState.remove(); received.remove(); };
  }, [refresh]);

  // Instant updates: the server nudges us the moment a notification or reminder is created.
  useEffect(() => connectRealtime((event, payload) => {
    if (event !== 'new-notification') return;
    refresh();
    if (payload?.type === 'reminder') requestReminderRefresh({ reset: false });
  }), [refresh]);

  const clearUnread = useCallback(async () => {
    setUnread(0);
    try { await markAllRead(); } catch { refresh(); }
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread, clearUnread }), [unread, refresh, clearUnread]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => useContext(NotificationContext);
