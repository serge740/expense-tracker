import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { AppState } from '@/rn';
import { getNotifications, markAllRead, markNotificationRead } from '@/services/notification.service';
import { connectRealtime } from '@/services/realtime';
import { requestReminderRefresh } from '@/utils/reminders';

/** The newest notification that arrived while the app was open (for the toast and the sound). */
export interface Arrival { id?: string; type: string; title?: string; body?: string; at: number }

interface NotificationContextValue {
  /** How many inbox notifications are still unread. */
  unread: number;
  /** Re-reads the count from the server. */
  refresh: () => Promise<void>;
  /** Screens that already know the new count (after reading or loading the inbox) set it here. */
  setUnread: Dispatch<SetStateAction<number>>;
  /** Marks everything read, on the server and here. */
  clearUnread: () => Promise<void>;
  lastArrival: Arrival | null;
}

const NotificationContext = createContext<NotificationContextValue>({
  unread: 0,
  refresh: async () => {},
  setUnread: () => {},
  clearUnread: async () => {},
  lastArrival: null,
});

/**
 * Holds the unread count for the whole signed-in app. It is refreshed when the app starts, when it comes back
 * to the foreground, the moment the server reports a new notification over the live connection, and when the
 * service worker says a push arrived (in case the live connection missed it). A notification that opened the
 * app from a push is marked read.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [lastArrival, setLastArrival] = useState<Arrival | null>(null);

  const refresh = useCallback(async () => {
    try { setUnread((await getNotifications(1, 1)).unreadCount); } catch { /* keep the last count */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', s => { if (s === 'active') void refresh(); });
    return () => appState.remove();
  }, [refresh]);

  // Instant updates: the server nudges us the moment a notification or reminder is created.
  useEffect(() => connectRealtime((event, payload) => {
    if (event !== 'new-notification') return;
    void refresh();
    setLastArrival({ id: payload?.id, type: payload?.type ?? 'system', title: payload?.title, body: payload?.body, at: Date.now() });
    if (payload?.type === 'reminder') requestReminderRefresh({ reset: false });
  }), [refresh]);

  // The service worker tells open tabs that a push arrived, in case the live connection missed it.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'push-received') return;
      void refresh();
      requestReminderRefresh({ reset: false });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refresh]);

  // A push opened the app with ?fromPush=<inbox row>: that notification has been seen, so mark it read.
  useEffect(() => {
    const url = new URL(window.location.href);
    const rowId = url.searchParams.get('fromPush');
    if (!rowId) return;
    url.searchParams.delete('fromPush');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    markNotificationRead(rowId).then(refresh).catch(() => {});
  }, [refresh]);

  const clearUnread = useCallback(async () => {
    setUnread(0);
    try { await markAllRead(); } catch { void refresh(); }
  }, [refresh]);

  const value = useMemo(() => ({ unread, refresh, setUnread, clearUnread, lastArrival }), [unread, refresh, clearUnread, lastArrival]);
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => useContext(NotificationContext);
